let client, clientConfig;
export const SESSION_COOKIE_ERROR = "Không lưu được phiên đăng nhập. Hãy cho phép cookie trên website rồi thử lại.";

export function createStudyApiClient(config, browser = window, fetchRequest = globalThis.fetch) {
  let csrfToken = "", currentUser = null, queued = Promise.resolve(), channel, timer;
  const listeners = new Set();
  const project = new URL(config.url).hostname.split(".")[0];
  const channelName = "english-study-session:" + project;
  try {
    browser.localStorage.removeItem(`sb-${project}-auth-token`);
    browser.localStorage.removeItem(`sb-${project}-auth-token-code-verifier`);
  } catch {}
  if (/access_token=|refresh_token=/.test(browser.location.hash || "")) {
    browser.history.replaceState(null, "", browser.location.pathname + browser.location.search);
  }

  function emit(user) {
    const changed = currentUser?.id !== user?.id;
    currentUser = user;
    if (changed) for (const listener of listeners) listener(user ? "SIGNED_IN" : "SIGNED_OUT", user ? { user } : null);
  }

  async function fetchJson(path, body, fetcher) {
    const response = await fetcher(path, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000)
    });
    const result = await response.json();
    if (result.csrfToken) csrfToken = result.csrfToken;
    if (!response.ok || result.ok !== true) {
      const error = new Error(result.error || "Không kết nối được tài khoản.");
      error.code = result.code;
      error.status = response.status;
      error.public = true;
      throw error;
    }
    return result;
  }

  function request(path, body, fetcher = fetchRequest) {
    const execute = async () => {
      if (body !== undefined) {
        const bootstrap = await fetchJson("/api/auth/session", undefined, fetcher);
        emit(bootstrap.user);
      }
      return fetchJson(path, body, fetcher);
    };
    // Serialize refreshes across tabs so rotating refresh cookies stay in order.
    const run = () => browser.navigator?.locks ? browser.navigator.locks.request(channelName, execute) : execute();
    const result = queued.then(run, run);
    queued = result.catch(() => {});
    return result;
  }

  async function restore() {
    try { const result = await request("/api/auth/session"); emit(result.user); return { data: { session: result.user ? { user: result.user } : null }, error: null }; }
    catch (error) { return { data: { session: null }, error }; }
  }

  async function authenticate(action, values = {}) {
    try {
      const result = await request("/api/auth/session", { action, ...values });
      if (action !== "send-code") {
        const restored = await restore();
        if (restored.error) throw restored.error;
        if (result.user && restored.data.session?.user.id !== result.user.id) {
          throw Object.assign(new Error(SESSION_COOKIE_ERROR), { code: "session_storage_unavailable" });
        }
        channel?.postMessage({ changed: true });
        return restored;
      }
      return { data: {}, error: null };
    } catch (error) { return { data: {}, error }; }
  }

  const visible = () => { if (browser.document.visibilityState === "visible") void restore(); };
  function listen() {
    if (timer) return;
    if (browser.BroadcastChannel) { channel = new browser.BroadcastChannel(channelName); channel.onmessage = () => void restore(); }
    browser.document.addEventListener("visibilitychange", visible);
    timer = browser.setInterval(() => void restore(), 10 * 60 * 1000);
  }
  function stop() {
    if (listeners.size) return;
    browser.clearInterval(timer); timer = undefined;
    channel?.close(); channel = undefined;
    browser.document.removeEventListener("visibilitychange", visible);
  }

  async function save(type, owner, rows) {
    for (let offset = 0; offset < rows.length; offset += 500) await request("/api/progress", { type, owner, rows: rows.slice(offset, offset + 500) });
  }

  return {
    request,
    data: {
      async getCatalog() { return (await request("/api/content")).catalog; },
      loadProgress: owner => request("/api/progress?owner=" + encodeURIComponent(owner)),
      saveWords: (owner, rows) => save("words", owner, rows),
      saveAttempts: (owner, rows) => save("attempts", owner, rows),
      async loadSrs(owner) { return (await request("/api/srs?owner=" + encodeURIComponent(owner))).rows; },
      async saveSrs(owner, rows) {
        for (let offset = 0; offset < rows.length; offset += 500) await request("/api/srs", { owner, rows: rows.slice(offset, offset + 500) });
      },
      async loadPractice(owner) { return (await request("/api/practice?owner=" + encodeURIComponent(owner))).rows; },
      async savePractice(owner, rows) {
        for (let offset = 0; offset < rows.length; offset += 500) await request("/api/practice", { owner, rows: rows.slice(offset, offset + 500) });
      }
    },
    auth: {
      getSession: restore,
      onAuthStateChange(listener) {
        listeners.add(listener); listen();
        return { data: { subscription: { unsubscribe() { listeners.delete(listener); stop(); } } } };
      },
      signInWithPassword: ({ email, password }) => authenticate("password", { email, password }),
      signInWithOtp: ({ email }) => authenticate("send-code", { email }),
      verifyOtp: ({ email, token }) => authenticate("verify-code", { email, token }),
      updateUser: ({ password }) => authenticate("password-update", { password }),
      signOut: () => authenticate("sign-out")
    }
  };
}

export function getStudyApiClient(config) {
  if (!client || clientConfig?.url !== config.url || clientConfig?.publishableKey !== config.publishableKey) {
    client = createStudyApiClient(config);
    clientConfig = config;
  }
  return client;
}
