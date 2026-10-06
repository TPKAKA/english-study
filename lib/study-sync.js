import { readSupabaseConfig } from "./supabase-config.js";
import { gradeReading } from "./quiz.js";

export function createStudySync({ config, initialContent, createClient, storage, onChange, schedule = callback => setTimeout(callback, 0), makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const storagePrefix = "english-study:" + (config.url || "local") + ":";
  let client = null, user = null, epoch = 0, loading = false, saving = false, disposed = false;
  let subscription, content = initialContent, contentStatus = "", authMessage = "", authBusy = false;
  let storageFailed = false, status = "Tiến độ trên thiết bị";
  let validWords = new Set(content.groups.flatMap(group => group.w.map(word => word[0])));
  let state = load("guest");

  function load(owner) {
    try {
      const value = JSON.parse(storage.getItem(storagePrefix + owner));
      if (value && value.words && value.pendingWords && Array.isArray(value.attempts) && Array.isArray(value.pendingAttempts)) return value;
    } catch {}
    return { words: {}, pendingWords: {}, attempts: [], pendingAttempts: [] };
  }

  function persist() {
    try {
      storage.setItem(storagePrefix + (user ? user.id : "guest"), JSON.stringify(state));
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
  }

  function snapshot() {
    return {
      content, contentStatus, user, status, authMessage, authBusy, storageFailed,
      connected: !!client, busy: loading || saving,
      known: Object.keys(state.words).filter(word => state.words[word].is_known && validWords.has(word)),
      attempts: state.attempts.slice().sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 10)
    };
  }

  function emit() {
    if (!disposed) onChange(snapshot());
  }

  function setStatus(message) {
    status = message;
    emit();
  }

  function current(token) {
    return !disposed && token === epoch;
  }

  async function flush() {
    if (!client || !user || loading || saving || disposed) return;
    const token = epoch, owner = user.id, currentState = state;
    saving = true;
    setStatus("Đang đồng bộ…");
    try {
      // An in-flight response must not clear newer clicks or another account's queue.
      while (current(token)) {
        const words = Object.entries(currentState.pendingWords);
        const attempts = currentState.pendingAttempts.slice();
        if (!words.length && !attempts.length) break;
        if (words.length) {
          const { error } = await client.from("vocabulary_progress").upsert(
            words.map(([word, value]) => ({ user_id: owner, word, ...value })),
            { onConflict: "user_id,word" }
          ).abortSignal(AbortSignal.timeout(15000));
          if (error) throw error;
          if (!current(token)) return;
          for (const [word, value] of words) {
            if (currentState.pendingWords[word] === value) delete currentState.pendingWords[word];
          }
          persist();
        }
        if (attempts.length) {
          const { error } = await client.from("reading_attempts").upsert(
            attempts.map(attempt => ({ ...attempt, user_id: owner })),
            { onConflict: "id", ignoreDuplicates: true }
          ).abortSignal(AbortSignal.timeout(15000));
          if (error) throw error;
          if (!current(token)) return;
          const savedIds = new Set(attempts.map(attempt => attempt.id));
          currentState.pendingAttempts = currentState.pendingAttempts.filter(attempt => !savedIds.has(attempt.id));
          persist();
        }
      }
      if (current(token)) setStatus("Đã đồng bộ");
    } catch {
      if (current(token)) setStatus("Chưa đồng bộ được. Tiến độ vẫn được giữ trên thiết bị.");
    } finally {
      if (current(token)) { saving = false; emit(); }
    }
  }

  async function refresh() {
    if (!client || !user || loading || saving || disposed) return;
    const token = epoch, owner = user.id;
    loading = true;
    setStatus("Đang tải tiến độ…");
    let success = false;
    try {
      const [progress, history] = await Promise.all([
        client.from("vocabulary_progress").select("word,is_known,updated_at").eq("user_id", owner).abortSignal(AbortSignal.timeout(15000)),
        client.from("reading_attempts").select("id,reading_id,answers,score,total,completed_at").eq("user_id", owner).order("completed_at", { ascending: false }).limit(30).abortSignal(AbortSignal.timeout(15000))
      ]);
      if (progress.error) throw progress.error;
      if (history.error) throw history.error;
      if (!current(token)) return;
      const words = Object.fromEntries(progress.data.filter(row => validWords.has(row.word)).map(row => [row.word, { is_known: row.is_known, updated_at: row.updated_at }]));
      state.words = { ...words, ...state.pendingWords };
      const attempts = new Map(history.data.map(attempt => [attempt.id, attempt]));
      for (const attempt of state.pendingAttempts) attempts.set(attempt.id, attempt);
      state.attempts = Array.from(attempts.values()).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 30);
      persist();
      success = true;
    } catch {
      if (current(token)) setStatus("Chưa đồng bộ được. Tiến độ vẫn được giữ trên thiết bị.");
    } finally {
      if (current(token)) { loading = false; emit(); }
    }
    if (success && current(token)) await flush();
  }

  function setSession(session) {
    if (disposed) return;
    const nextUser = session ? session.user : null;
    if ((nextUser && nextUser.id) === (user && user.id)) return;
    epoch++;
    user = nextUser;
    loading = false;
    saving = false;
    state = load(user ? user.id : "guest");
    authMessage = "";
    setStatus(user ? "Đang tải tiến độ…" : "Tiến độ trên thiết bị");
    if (user) void refresh();
  }

  async function loadContent() {
    contentStatus = "Đang tải bài học…";
    emit();
    try {
      const tables = ["vocabulary_groups", "vocabulary_words", "reading_passages", "reading_questions"];
      const results = await Promise.all(tables.map(table => client.from(table).select("*").order("sort_order", { ascending: true }).abortSignal(AbortSignal.timeout(15000))));
      for (const result of results) if (result.error) throw result.error;
      if (disposed) return;
      const [groups, words, readings, questions] = results.map(result => result.data);
      const nextContent = {
        groups: groups.map(group => ({ id: group.id, n: group.title, w: words.filter(word => word.group_id === group.id).map(word => [word.word, word.meaning, word.example]) })).filter(group => group.w.length),
        readings: readings.map(reading => ({ id: reading.id, t: reading.title, time: reading.time_label, p: reading.p, q: questions.filter(question => question.reading_id === reading.id).map(question => ({ q: question.prompt, o: question.options, a: question.answer_index, e: question.explanation })) })).filter(reading => reading.q.length)
      };
      if (!nextContent.groups.length || !nextContent.readings.length) throw new Error("Empty lesson content");
      content = nextContent;
      validWords = new Set(content.groups.flatMap(group => group.w.map(word => word[0])));
      contentStatus = "";
    } catch {
      if (!disposed) contentStatus = "Đang dùng bài học có sẵn trên thiết bị.";
    }
    emit();
  }

  async function start() {
    emit();
    try {
      const checked = readSupabaseConfig({ url_db: config.url, publishableKey: config.publishableKey }, { allowMissing: true });
      if (!checked.publishableKey || disposed) return;
      client = createClient(checked);
      setStatus("Đang kết nối…");
      const result = client.auth.onAuthStateChange((event, session) => {
        // Leave the SDK's auth lock before starting database requests.
        schedule(() => setSession(session));
      });
      subscription = result.data.subscription;
      await loadContent();
      if (disposed) return;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      setSession(data.session);
      if (!user) setStatus("Tiến độ trên thiết bị");
    } catch {
      subscription?.unsubscribe();
      client = null;
      setStatus("Chưa kết nối được tài khoản. Tiến độ được lưu trên thiết bị.");
    }
  }

  async function signIn(email, redirectUrl) {
    if (!client || authBusy || disposed) return;
    authBusy = true;
    authMessage = "Đang gửi liên kết…";
    emit();
    try {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectUrl } });
      if (error) throw error;
      authMessage = "Đã gửi liên kết đăng nhập. Hãy kiểm tra email.";
    } catch {
      authMessage = "Không gửi được liên kết. Vui lòng thử lại sau.";
    } finally {
      authBusy = false;
      emit();
    }
  }

  async function signOut() {
    if (!client || authBusy || disposed) return;
    const owner = user?.id;
    authBusy = true;
    emit();
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      if (user?.id === owner) setSession(null);
    } catch {
      setStatus("Chưa đăng xuất được. Vui lòng thử lại.");
    } finally {
      authBusy = false;
      emit();
    }
  }

  return {
    start, refresh, signIn, signOut, snapshot,
    stop() { disposed = true; epoch++; subscription?.unsubscribe(); },
    mark(word, isKnown) {
      if (disposed || !validWords.has(word)) return;
      const value = { is_known: !!isKnown, updated_at: now() };
      state.words = { ...state.words, [word]: value };
      if (user) state.pendingWords = { ...state.pendingWords, [word]: value };
      persist();
      emit();
      void flush();
    },
    saveAttempt(readingId, answers) {
      const reading = content.readings.find(item => item.id === readingId);
      const grade = reading && gradeReading(reading, answers);
      if (disposed || !grade) return false;
      const attempt = { id: makeId(), reading_id: readingId, answers: answers.slice(), ...grade, completed_at: now() };
      state.attempts = [attempt, ...state.attempts].slice(0, 30);
      if (user) state.pendingAttempts.push(attempt);
      persist();
      emit();
      void flush();
      return true;
    }
  };
}
