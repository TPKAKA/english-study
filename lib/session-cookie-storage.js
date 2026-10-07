import { parse, serialize } from "cookie";
import { combineChunks, createChunks, isChunkLike, stringFromBase64URL, stringToBase64URL } from "@supabase/ssr";

export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
export const SESSION_COOKIE_ERROR = "Không lưu được phiên đăng nhập. Hãy cho phép cookie trên website rồi thử lại.";

export function createSessionCookieStorage({ document, secure, sessionKey, legacyStorage }) {
  const options = { path: "/", sameSite: "lax", secure, maxAge: SESSION_COOKIE_MAX_AGE };
  const readCookies = () => parse(document.cookie);

  function removeLegacy(key) {
    try { legacyStorage()?.removeItem(key); } catch {}
  }

  function clearCookies(key) {
    for (const name of Object.keys(readCookies())) {
      if (isChunkLike(name, key)) document.cookie = serialize(name, "", { ...options, maxAge: 0 });
    }
  }

  async function setItem(key, value) {
    // Supabase's chunk helpers keep large sessions below the browser's per-cookie limit.
    const encoded = "base64-" + stringToBase64URL(value);
    const chunks = createChunks(key, encoded);
    const names = new Set(chunks.map(chunk => chunk.name));
    try {
      for (const { name, value } of chunks) document.cookie = serialize(name, value, options);
      for (const name of Object.keys(readCookies())) {
        if (isChunkLike(name, key) && !names.has(name)) document.cookie = serialize(name, "", { ...options, maxAge: 0 });
      }
      const saved = readCookies();
      if (await combineChunks(key, name => saved[name]) !== encoded) throw new Error();
    } catch {
      try { clearCookies(key); } catch {}
      const error = new Error(SESSION_COOKIE_ERROR);
      error.code = "session_storage_unavailable";
      throw error;
    }
    removeLegacy(key);
  }

  function removeItem(key) {
    clearCookies(key);
    removeLegacy(key);
  }

  return {
    async getItem(key) {
      const cookies = readCookies();
      const encoded = await combineChunks(key, name => cookies[name]);
      if (encoded) {
        try {
          const value = encoded.startsWith("base64-") ? stringFromBase64URL(encoded.slice(7)) : encoded;
          JSON.parse(value);
          removeLegacy(key);
          return value;
        } catch {
          removeItem(key);
          return null;
        }
      }
      if (Object.keys(cookies).some(name => isChunkLike(name, key))) {
        removeItem(key);
        return null;
      }
      if (key !== sessionKey) return null;
      // Migrate only this project's old auth entry; learning progress stays in localStorage.
      let previous;
      try { previous = legacyStorage()?.getItem(key); } catch { return null; }
      if (!previous) return null;
      try {
        const session = JSON.parse(previous);
        if (typeof session?.access_token !== "string" || !session.access_token || typeof session.refresh_token !== "string" || !session.refresh_token || !Number.isFinite(session.expires_at)) throw new Error();
      } catch {
        removeLegacy(key);
        return null;
      }
      await setItem(key, previous);
      return previous;
    },
    setItem,
    removeItem
  };
}
