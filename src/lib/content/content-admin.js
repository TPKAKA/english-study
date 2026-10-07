import { BRITISH_IPA } from "../study/pronunciation.js";
import { DEFAULT_LANGUAGES, cardId, normalizedWord } from "../study/languages.js";

const TABLES = {
  languages: { table: "study_languages", key: "code" },
  groups: { table: "vocabulary_groups", key: "id" },
  words: { table: "vocabulary_words", key: "word" },
  readings: { table: "reading_passages", key: "id" },
  questions: { table: "reading_questions", key: "reading_id" }
};
export const multilingualCatalog = catalog => catalog.multilingual ?? !!catalog.languages;

export async function fetchCatalog(client) {
  const catalog = {};
  try {
    const { data, error } = await client.from("study_languages").select("*").order("sort_order", { ascending: true }).order("code", { ascending: true }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    catalog.languages = data; catalog.multilingual = true;
  } catch (error) {
    if (!["42P01", "PGRST205"].includes(error?.code)) throw error;
    catalog.languages = [DEFAULT_LANGUAGES[0]]; catalog.multilingual = false;
  }
  for (const [entity, { table, key }] of Object.entries(TABLES)) {
    if (entity === "languages") continue;
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select("*")
        .order("sort_order", { ascending: true }).order(entity === "words" && catalog.multilingual ? "id" : key, { ascending: true })
        .range(offset, offset + 499).abortSignal(AbortSignal.timeout(15000));
      if (result.error) throw result.error;
      rows.push(...result.data);
      if (result.data.length < 500) break;
    }
    catalog[entity] = rows;
  }
  return catalog;
}

export function toStudyContent(catalog) {
  return {
    languages: catalog.languages ?? [DEFAULT_LANGUAGES[0]],
    groups: catalog.groups.map(group => ({ id: group.id, n: group.title, language_code: group.language_code || "en",
      w: catalog.words.filter(word => word.group_id === group.id).map(word => {
        const storedIpa = typeof word.ipa === "string" ? word.ipa.trim() : "";
        const lookup = word.word.trim().replace(/\s+/g, " ").toLowerCase();
        const language_code = group.language_code || "en";
        const fallbackIpa = language_code === "en" && Object.hasOwn(BRITISH_IPA, lookup) ? BRITISH_IPA[lookup] : "";
        return [word.word, word.meaning, word.example, storedIpa || fallbackIpa,
          { id: cardId(word), language_code, pronunciation_mode: catalog.languages?.find(language => language.code === language_code)?.pronunciation_mode || (language_code === "en" ? "ipa" : "reading"), reading: word.reading || "", romanization: word.romanization || "",
            cloze_text: word.cloze_text || "", cloze_answer: word.cloze_answer || "" }];
      })
    })),
    readings: catalog.readings.map(reading => ({ id: reading.id, t: reading.title, language_code: reading.language_code || "en",
      time: reading.time_label, p: reading.passage,
      q: catalog.questions.filter(question => question.reading_id === reading.id).map(question =>
        ({ q: question.prompt, o: question.options, a: question.answer_index, e: question.explanation }))
    })).filter(reading => reading.q.length)
  };
}

function text(value, label, max, required = true) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (required && !cleaned) throw new Error(`${label} không được để trống.`);
  if (cleaned.length > max) throw new Error(`${label} tối đa ${max} ký tự.`);
  return cleaned;
}

export function validateContent(entity, draft, originalKey, catalog) {
  const upgraded = multilingualCatalog(catalog);
  const sort_order = Number(draft.sort_order);
  if (draft.sort_order == null || draft.sort_order === "" || typeof draft.sort_order === "boolean" || !Number.isInteger(sort_order) || sort_order < 0 || sort_order > 2147483647) {
    throw new Error("Thứ tự phải là số nguyên không âm.");
  }
  if (entity === "words") {
    const word = text(draft.word, "Từ vựng", 200);
    const old = originalKey && catalog.words.find(row => cardId(row) === originalKey);
    if (!upgraded && originalKey && word !== originalKey) throw new Error("Không thể đổi định danh từ đã lưu.");
    if (upgraded && originalKey && draft.id != null && draft.id !== originalKey) throw new Error("Không thể đổi ID thẻ đã lưu.");
    if (catalog.words.some(row => (!upgraded || row.group_id === draft.group_id) && cardId(row) !== originalKey && normalizedWord(row.word) === normalizedWord(word))) {
      throw new Error("Từ này đã tồn tại. Hãy sửa từ hiện có.");
    }
    const group = catalog.groups.find(group => group.id === draft.group_id);
    if (!group) throw new Error("Hãy chọn nhóm từ hợp lệ.");
    if (old && (catalog.groups.find(group => group.id === old.group_id)?.language_code || "en") !== (group.language_code || "en")) throw new Error("Không thể chuyển thẻ sang ngôn ngữ khác. Hãy tạo thẻ mới.");
    const extra = upgraded ? { ...(originalKey || draft.id ? { id: originalKey || text(draft.id, "ID", 200) } : {}),
      reading: text(draft.reading, "Cách đọc", 500, false), romanization: text(draft.romanization, "Phiên âm Latin", 500, false),
      cloze_text: text(draft.cloze_text, "Câu điền từ", 5000, false), cloze_answer: text(draft.cloze_answer, "Đáp án điền từ", 200, false) } : {};
    if (upgraded && (!!extra.cloze_text !== !!extra.cloze_answer || (extra.cloze_text && !extra.cloze_text.includes("_____")))) throw new Error("Câu điền từ cần chỗ trống _____ và đáp án tương ứng.");
    return { word, group_id: draft.group_id, meaning: text(draft.meaning, "Nghĩa", 2000),
      ipa: text(draft.ipa, "IPA", 500, false), example: text(draft.example, "Ví dụ", 5000, false), sort_order, ...extra };
  }
  if (entity === "languages") {
    if (!upgraded) throw new Error("Cần chạy migration đa ngôn ngữ trên Supabase trước.");
    const code = text(draft.code, "Mã ngôn ngữ", 35);
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(code) || (originalKey && code !== originalKey)) throw new Error("Mã ngôn ngữ không hợp lệ hoặc đã thay đổi.");
    let speech_locale;
    try { speech_locale = new Intl.Locale(text(draft.speech_locale, "Giọng đọc", 35)).toString(); } catch { throw new Error("Mã giọng đọc không hợp lệ."); }
    if (!["ipa", "reading"].includes(draft.pronunciation_mode)) throw new Error("Kiểu phiên âm không hợp lệ.");
    return { code, name: text(draft.name, "Tên ngôn ngữ", 100), speech_locale, pronunciation_mode: draft.pronunciation_mode, sort_order };
  }
  const language_code = draft.language_code || "en";
  if (upgraded && !(catalog.languages || []).some(language => language.code === language_code)) throw new Error("Hãy chọn ngôn ngữ hợp lệ.");
  const previous = originalKey && catalog[entity]?.find(row => row.id === originalKey);
  if (previous && (previous.language_code || "en") !== language_code) throw new Error("Không thể đổi ngôn ngữ nội dung đã lưu. Hãy tạo nội dung mới.");
  const language = upgraded ? { language_code } : {};
  if (entity === "groups") return { title: text(draft.title, "Tên nhóm", 200), sort_order, ...language };
  if (entity === "readings") {
    if (!Array.isArray(draft.questions) || !draft.questions.length || draft.questions.length > 100) {
      throw new Error("Bài đọc cần từ 1 đến 100 câu hỏi.");
    }
    const questions = draft.questions.map((question, index) => {
      const label = `Câu ${index + 1}`;
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 10) {
        throw new Error(`${label} cần từ 2 đến 10 lựa chọn.`);
      }
      if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= question.options.length) {
        throw new Error(`${label}: hãy chọn đáp án đúng.`);
      }
      return { prompt: text(question.prompt, label, 2000),
        options: question.options.map(option => text(option, `${label}: lựa chọn`, 2000)),
        answer_index: question.answer_index, explanation: text(question.explanation, `${label}: giải thích`, 5000, false) };
    });
    return { title: text(draft.title, "Tiêu đề", 200), time_label: text(draft.time_label, "Thời gian", 100, false),
      passage: text(draft.passage, "Bài đọc", 100000), sort_order, questions, ...language };
  }
  throw new Error("Loại nội dung không hợp lệ.");
}

export function contentError(error) {
  if (error?.code === "23505") return "Nội dung này đã tồn tại. Hãy tải lại danh sách.";
  if (["23503", "23001"].includes(error?.code)) return "Nội dung còn bản ghi liên quan hoặc đã thay đổi. Hãy chuyển/xóa nội dung con rồi thử lại.";
  if (["23502", "23514", "22023", "22P02"].includes(error?.code)) return "Nội dung hoặc câu hỏi không hợp lệ. Hãy kiểm tra các trường và đáp án.";
  if (["42501", "PGRST301", "PGRST302"].includes(error?.code)) return "Bạn không có quyền sửa nội dung hoặc phiên đăng nhập đã hết hạn.";
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error?.code)) return "Cần chạy migration IPA và CRUD trên Supabase trước.";
  if (["PGRST116", "P0002"].includes(error?.code)) return "Nội dung không còn tồn tại hoặc quyền sửa đã thay đổi. Hãy tải lại.";
  return "Không lưu được thay đổi. Kiểm tra kết nối và thử lại.";
}

export async function mutateContent(client, { entity, action, key, draft }, catalog, makeId = () => crypto.randomUUID()) {
  const definition = Object.hasOwn(TABLES, entity) ? TABLES[entity] : null;
  if (!definition || entity === "questions" || !["create", "update", "delete"].includes(action)) throw new Error("Thao tác không hợp lệ.");
  if (action !== "create" && (typeof key !== "string" || !key)) throw new Error("Thiếu định danh nội dung.");
  if (action === "delete" && entity === "groups" && catalog.words.some(word => word.group_id === key)) {
    throw new Error("Hãy chuyển hoặc xóa hết từ trong nhóm trước khi xóa nhóm.");
  }
  if (entity === "languages" && !multilingualCatalog(catalog)) throw new Error("Cần chạy migration đa ngôn ngữ trên Supabase trước.");
  if (action === "delete" && entity === "languages" && (catalog.groups.some(group => group.language_code === key) || catalog.readings.some(reading => reading.language_code === key))) throw new Error("Ngôn ngữ còn nhóm từ hoặc bài đọc. Hãy xóa nội dung trước.");
  const row = action === "delete" ? null : validateContent(entity, draft, action === "update" ? key : null, catalog);
  // A form supplies a stable ID so retrying a lost response cannot duplicate a create.
  const upgraded = multilingualCatalog(catalog);
  const primaryKey = entity === "words" && upgraded ? "id" : definition.key;
  const id = entity === "languages" ? row?.code || key : action === "create" && (entity !== "words" || upgraded) ? (draft.id ? text(draft.id, "ID", 200) : makeId()) : key;
  let request;
  if (entity === "readings" && action !== "delete") {
    const { questions, ...passage } = row;
    request = client.rpc("save_reading_content", { p_id: id,
      p_create: action === "create", p_passage: passage, p_questions: questions });
  } else {
    request = client.from(definition.table);
    if (action === "delete") request = request.delete().eq(primaryKey, key);
    else if (action === "update") {
      const { [primaryKey]: ignored, ...changes } = row;
      request = request.update(changes).eq(primaryKey, key);
    } else request = request.insert(entity === "groups" || (entity === "words" && upgraded) ? { ...row, id } : row);
    request = request.select(primaryKey).single();
  }
  let result;
  try { result = await request.abortSignal(AbortSignal.timeout(15000)); }
  catch { throw new Error(contentError(null)); }
  const { error } = result;
  if (error) throw new Error(contentError(error));
}
