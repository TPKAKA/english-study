import { readSupabaseConfig } from "../supabase/supabase-config.js";
import { gradeReading } from "./quiz.js";
import { toStudyContent } from "../content/content-admin.js";
import { createStudyData } from "./study-data.js";
import { requestAdmin } from "../admin/admin-browser.js";
import { SESSION_COOKIE_ERROR } from "../api/api-client.js";
import { createSrsData } from "./srs-data.js";
import { normalizeSrsRecords, reviewSrsCard } from "./srs.js";
import { createPracticeData } from "./practice-data.js";
import { gradePracticeAnswer, normalizePracticeRecords } from "./typing-practice.js";
import { cardId } from "./languages.js";

export function createStudySync({ config, initialContent, createClient, storage, onChange, adminRequest = requestAdmin, schedule = callback => setTimeout(callback, 0), makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const storagePrefix = "english-study:" + (config.url || "local") + ":";
  let client = null, user = null, epoch = 0, loading = false, saving = false, disposed = false;
  let repository, srsRepository, practiceRepository;
  let srsLoading = false, srsSaving = false, srsStatus = "Lịch ôn trên thiết bị";
  let practiceLoading = false, practiceSaving = false, practiceStatus = "Luyện gõ trên thiết bị";
  let subscription, content = initialContent, contentStatus = "", authMessage = "", authBusy = false;
  let storageFailed = false, status = "Tiến độ trên thiết bị";
  let catalog = null, contentRevision = 0, contentLoading = false, contentRequest = 0;
  let canEdit = false, editorStatus = "", adminBusy = false;
  let validWords = new Set(content.groups.flatMap(group => group.w.map(cardId)));
  let state = load("guest");

  function load(owner) {
    try {
      const value = JSON.parse(storage.getItem(storagePrefix + owner));
      if (value && value.words && value.pendingWords && Array.isArray(value.attempts) && Array.isArray(value.pendingAttempts)) return {
        ...value, srs: normalizeSrsRecords(Object.values(value.srs || {})), pendingSrs: normalizeSrsRecords(Object.values(value.pendingSrs || {})),
        practice: normalizePracticeRecords(Object.values(value.practice || {})), pendingPractice: normalizePracticeRecords(Object.values(value.pendingPractice || {}))
      };
    } catch {}
    return { words: {}, pendingWords: {}, attempts: [], pendingAttempts: [], srs: {}, pendingSrs: {}, practice: {}, pendingPractice: {} };
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
      content, contentStatus, contentRevision, catalog, contentLoading,
      canEdit, editorStatus, adminBusy, user, status, authMessage, authBusy, storageFailed,
      connected: !!client, busy: loading || saving,
      srs: state.srs, srsLoading, srsSaving, srsStatus,
      practice: state.practice, practiceLoading, practiceSaving, practiceStatus,
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

  async function flushSrs() {
    if (!client || !user || srsLoading || srsSaving || disposed || !Object.keys(state.pendingSrs).length) return;
    const token = epoch, owner = user.id, currentState = state;
    srsSaving = true; srsStatus = "Đang đồng bộ lịch ôn…"; emit();
    try {
      while (current(token)) {
        const pending = Object.entries(currentState.pendingSrs);
        if (!pending.length) break;
        await srsRepository.saveSrs(owner, pending.map(([, row]) => row));
        if (!current(token)) return;
        for (const [word, row] of pending) if (currentState.pendingSrs[word] === row) delete currentState.pendingSrs[word];
        persist();
      }
      if (current(token)) srsStatus = "Lịch ôn đã đồng bộ";
    } catch {
      if (current(token)) srsStatus = "Chưa đồng bộ được lịch ôn. Lịch vẫn được giữ trên thiết bị.";
    } finally { if (current(token)) { srsSaving = false; emit(); } }
  }

  async function refreshSrs() {
    if (!client || !user || srsLoading || srsSaving || disposed) return;
    const token = epoch, owner = user.id;
    srsLoading = true; srsStatus = "Đang tải lịch ôn…"; emit();
    let success = false;
    try {
      const records = normalizeSrsRecords(await srsRepository.loadSrs(owner));
      if (!current(token)) return;
      for (const [word, row] of Object.entries(state.pendingSrs)) {
        if (records[word] && Date.parse(records[word].reviewed_at) >= Date.parse(row.reviewed_at)) delete state.pendingSrs[word];
      }
      state.srs = { ...records, ...state.pendingSrs };
      persist(); success = true; srsStatus = "Lịch ôn đã đồng bộ";
    } catch {
      if (current(token)) srsStatus = "Chưa đồng bộ được lịch ôn. Lịch vẫn được giữ trên thiết bị.";
    } finally { if (current(token)) { srsLoading = false; emit(); } }
    if (success && current(token)) await flushSrs();
  }

  async function flushPractice() {
    if (!client || !user || practiceLoading || practiceSaving || disposed || !Object.keys(state.pendingPractice).length) return;
    const token = epoch, owner = user.id, currentState = state;
    practiceSaving = true; practiceStatus = "Đang đồng bộ luyện gõ…"; emit();
    try {
      while (current(token)) {
        const pending = Object.entries(currentState.pendingPractice);
        if (!pending.length) break;
        await practiceRepository.savePractice(owner, pending.map(([, row]) => row));
        if (!current(token)) return;
        for (const [word, row] of pending) if (currentState.pendingPractice[word] === row) delete currentState.pendingPractice[word];
        persist();
      }
      if (current(token)) practiceStatus = "Luyện gõ đã đồng bộ";
    } catch {
      if (current(token)) practiceStatus = "Chưa đồng bộ được luyện gõ. Kết quả vẫn được giữ trên thiết bị.";
    } finally { if (current(token)) { practiceSaving = false; emit(); } }
  }

  async function refreshPractice() {
    if (!client || !user || practiceLoading || practiceSaving || disposed) return;
    const token = epoch, owner = user.id;
    practiceLoading = true; practiceStatus = "Đang tải luyện gõ…"; emit();
    let success = false;
    try {
      const records = normalizePracticeRecords(await practiceRepository.loadPractice(owner));
      if (!current(token)) return;
      for (const [word, row] of Object.entries(state.pendingPractice)) {
        if (Object.hasOwn(records, word) && records[word].answered_at >= row.answered_at) delete state.pendingPractice[word];
      }
      state.practice = { ...records, ...state.pendingPractice };
      persist(); success = true; practiceStatus = "Luyện gõ đã đồng bộ";
    } catch {
      if (current(token)) practiceStatus = "Chưa đồng bộ được luyện gõ. Kết quả vẫn được giữ trên thiết bị.";
    } finally { if (current(token)) { practiceLoading = false; emit(); } }
    if (success && current(token)) await flushPractice();
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
          await repository.saveWords(owner, words.map(([word, value]) => ({ word, ...value })));
          if (!current(token)) return;
          for (const [word, value] of words) {
            if (currentState.pendingWords[word] === value) delete currentState.pendingWords[word];
          }
          persist();
        }
        if (attempts.length) {
          await repository.saveAttempts(owner, attempts);
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
      const progress = await repository.loadProgress(owner);
      if (!current(token)) return;
      const words = Object.fromEntries(progress.words.filter(row => validWords.has(row.word)).map(row => [row.word, { is_known: row.is_known, updated_at: row.updated_at }]));
      state.words = { ...words, ...state.pendingWords };
      const attempts = new Map(progress.attempts.map(attempt => [attempt.id, attempt]));
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
    srsLoading = false; srsSaving = false;
    srsStatus = user ? "Đang tải lịch ôn…" : "Lịch ôn trên thiết bị";
    practiceLoading = false; practiceSaving = false;
    practiceStatus = user ? "Đang tải luyện gõ…" : "Luyện gõ trên thiết bị";
    adminBusy = false;
    canEdit = false;
    editorStatus = user ? "Đang kiểm tra quyền quản lý…" : "";
    state = load(user ? user.id : "guest");
    authMessage = "";
    setStatus(user ? "Đang tải tiến độ…" : "Tiến độ trên thiết bị");
    if (user) { void refresh(); void refreshSrs(); void refreshPractice(); void loadEditorPermission(); }
  }

  async function loadEditorPermission() {
    if (!client || !user || disposed) return;
    const token = epoch;
    try {
      const result = await adminRequest(client);
      if (!current(token)) return;
      canEdit = result.ok === true && result.canEdit === true;
      editorStatus = canEdit ? "Có quyền quản lý nội dung" : result.error || "Tài khoản chưa được cấp quyền quản lý";
    } catch {
      if (!current(token)) return;
      canEdit = false;
      editorStatus = "Chưa kiểm tra được quyền quản lý. Hãy thử lại.";
    }
    emit();
  }

  async function loadContent() {
    if (!client || disposed) return false;
    const request = ++contentRequest;
    contentLoading = true;
    contentStatus = "Đang tải bài học…";
    emit();
    try {
      const nextCatalog = await repository.getCatalog();
      if (disposed || request !== contentRequest) return false;
      catalog = nextCatalog;
      content = toStudyContent(catalog);
      contentRevision++;
      validWords = new Set(content.groups.flatMap(group => group.w.map(cardId)));
      state.srs = Object.fromEntries(Object.entries(state.srs).filter(([word]) => validWords.has(word)));
      state.pendingSrs = Object.fromEntries(Object.entries(state.pendingSrs).filter(([word]) => validWords.has(word)));
      state.practice = Object.fromEntries(Object.entries(state.practice).filter(([word]) => validWords.has(word)));
      state.pendingPractice = Object.fromEntries(Object.entries(state.pendingPractice).filter(([word]) => validWords.has(word)));
      persist();
      contentStatus = "";
      return true;
    } catch {
      if (!disposed && request === contentRequest) contentStatus = catalog
        ? "Chưa tải lại được bài học. Đang giữ danh sách đã tải."
        : "Đang dùng bài học có sẵn trên thiết bị.";
      return false;
    } finally {
      if (!disposed && request === contentRequest) { contentLoading = false; emit(); }
    }
  }

  async function start() {
    emit();
    try {
      const checked = readSupabaseConfig({ url_db: config.url, publishableKey: config.publishableKey }, { allowMissing: true });
      if (!checked.publishableKey || disposed) return;
      client = createClient(checked);
      repository = client.data || createStudyData(client);
      srsRepository = client.data?.loadSrs ? client.data : createSrsData(client);
      practiceRepository = client.data?.loadPractice ? client.data : createPracticeData(client);
      setStatus("Đang kết nối…");
      const result = client.auth.onAuthStateChange((event, session) => {
        // Finish the auth notification before starting dependent requests.
        schedule(() => setSession(session));
      });
      subscription = result.data.subscription;
      await loadContent();
      if (disposed) return;
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      setSession(data.session);
      if (!user) setStatus("Tiến độ trên thiết bị");
    } catch (error) {
      subscription?.unsubscribe();
      client = null;
      setStatus(error.code === "session_storage_unavailable" ? SESSION_COOKIE_ERROR : "Chưa kết nối được tài khoản. Tiến độ được lưu trên thiết bị.");
    }
  }

  async function signIn(email, redirectUrl) {
    if (!client || authBusy || disposed) return { ok: false };
    authBusy = true;
    authMessage = "Đang gửi liên kết…";
    emit();
    try {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: redirectUrl ? { emailRedirectTo: redirectUrl } : {} });
      if (error) throw error;
      authMessage = "Đã gửi email xác thực. Hãy kiểm tra hộp thư.";
      return { ok: true };
    } catch {
      authMessage = "Không gửi được email xác thực. Vui lòng thử lại sau.";
      return { ok: false };
    } finally {
      authBusy = false;
      emit();
    }
  }

  async function authenticate(method, credentials) {
    if (!client || authBusy || disposed) return { ok: false };
    authBusy = true;
    authMessage = "Đang đăng nhập…";
    emit();
    try {
      const { data, error } = await client.auth[method](credentials);
      if (error) throw error;
      if (!data?.session?.user || disposed) throw new Error("Missing session");
      setSession(data.session);
      authMessage = "Đã đăng nhập.";
      return { ok: true };
    } catch (error) {
      authMessage = ["session_storage_unavailable", "csrf_failed"].includes(error.code) ? SESSION_COOKIE_ERROR
        : error.code === "email_not_confirmed" ? "Email chưa được xác nhận. Hãy xác thực email trước."
        : ["over_request_rate_limit", "over_email_send_rate_limit"].includes(error.code) ? "Quá nhiều yêu cầu. Hãy chờ rồi thử lại."
        : method === "verifyOtp" ? "Mã không đúng hoặc đã hết hạn. Hãy yêu cầu mã mới."
        : "Không đăng nhập được. Kiểm tra email, mật khẩu và kết nối rồi thử lại.";
      return { ok: false };
    } finally { authBusy = false; emit(); }
  }

  async function setPassword(password) {
    if (!client || !user || authBusy || disposed) return { ok: false };
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      authMessage = "Mật khẩu mới cần từ 8 đến 128 ký tự.";
      emit();
      return { ok: false };
    }
    const owner = user.id;
    authBusy = true;
    authMessage = "Đang cập nhật mật khẩu…";
    emit();
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      if (disposed || user?.id !== owner) return { ok: false };
      authMessage = "Đã đặt mật khẩu. Lần sau có thể đăng nhập bằng email và mật khẩu.";
      return { ok: true };
    } catch (error) {
      if (user?.id === owner) authMessage = error.code === "weak_password" ? "Mật khẩu chưa đáp ứng chính sách bảo mật của Supabase."
        : "Chưa đổi được mật khẩu. Hãy xác thực/đăng nhập lại rồi thử lại.";
      return { ok: false };
    } finally { authBusy = false; emit(); }
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
    start, async refresh() { await refresh(); await refreshSrs(); await refreshPractice(); }, refreshSrs, refreshPractice, signIn, signOut, setPassword, snapshot, reloadContent: loadContent,
    submitPracticeAnswer(word, mode, answer) {
      if (disposed || practiceLoading || contentLoading || !validWords.has(word)) return null;
      const card = content.groups.flatMap(group => group.w).find(card => cardId(card) === word);
      const grade = gradePracticeAnswer(card, mode, answer);
      if (!grade) return null;
      const previous = Object.hasOwn(state.practice, word) ? state.practice[word] : null;
      const answered_at = new Date(Math.max(Date.parse(now()), previous ? Date.parse(previous.answered_at) + 1 : 0)).toISOString();
      const row = { word, mode, last_answer: answer.trim(), needs_retry: !grade.correct, answered_at };
      state.practice = { ...state.practice, [word]: row };
      if (user) state.pendingPractice = { ...state.pendingPractice, [word]: row };
      persist(); emit(); void flushPractice(); return grade;
    },
    reviewWord(word, rating) {
      if (disposed || srsLoading || !validWords.has(word)) return false;
      try {
        const previous = Object.hasOwn(state.srs, word) ? state.srs[word].card : null;
        const time = Math.max(Date.parse(now()), previous?.last_review ? Date.parse(previous.last_review) + 1 : 0);
        if (previous && Date.parse(previous.due) > time) return false;
        const reviewed_at = new Date(time).toISOString();
        const row = { word, rating, reviewed_at, previous_card: previous, card: reviewSrsCard(previous, rating, reviewed_at) };
        state.srs = { ...state.srs, [word]: row };
        if (user) state.pendingSrs = { ...state.pendingSrs, [word]: row };
        persist(); emit(); void flushSrs(); return true;
      } catch { return false; }
    },
    async signInWithPassword(email, password) {
      if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password || password.length > 128) return { ok: false };
      return authenticate("signInWithPassword", { email: email.trim(), password });
    },
    async verifyEmailCode(email, token) {
      if (typeof email !== "string" || !email.trim() || typeof token !== "string" || !/^[0-9]{6,10}$/.test(token.trim())) {
        authMessage = "Mã xác thực cần từ 6 đến 10 chữ số.";
        emit();
        return { ok: false };
      }
      return authenticate("verifyOtp", { email: email.trim(), token: token.trim(), type: "email" });
    },
    async refreshPermission() { await loadEditorPermission(); },
    async editContent(change) {
      if (!client || !user || !canEdit || disposed) return { ok: false, error: "Bạn cần đăng nhập bằng tài khoản được cấp quyền quản lý." };
      if (!catalog || contentLoading || adminBusy) return { ok: false, error: "Hãy chờ danh sách tải xong rồi thử lại." };
      const token = epoch;
      adminBusy = true;
      emit();
      try {
        const result = await adminRequest(client, change);
        if (!result.ok) throw new Error(result.error || "Không lưu được thay đổi.");
        if (!current(token)) return { ok: false, error: "Phiên đăng nhập đã thay đổi. Hãy tải lại danh sách để kiểm tra kết quả." };
        const loaded = await loadContent();
        if (!current(token)) return { ok: false, error: "Phiên đăng nhập đã thay đổi. Hãy tải lại danh sách để kiểm tra kết quả." };
        return { ...result, warning: loaded ? "" : "Đã lưu trên Supabase, nhưng chưa tải lại được danh sách. Hãy bấm tải lại." };
      } catch (error) {
        return { ok: false, error: error.message || "Không lưu được thay đổi." };
      } finally {
        if (current(token)) { adminBusy = false; emit(); }
      }
    },
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
