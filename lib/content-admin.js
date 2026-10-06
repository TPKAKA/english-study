import { BRITISH_IPA } from "./pronunciation.js";

const TABLES = {
  groups: { table: "vocabulary_groups", key: "id" },
  words: { table: "vocabulary_words", key: "word" },
  readings: { table: "reading_passages", key: "id" },
  questions: { table: "reading_questions", key: "reading_id" }
};

export async function fetchCatalog(client) {
  const catalog = {};
  for (const [entity, { table, key }] of Object.entries(TABLES)) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select("*")
        .order("sort_order", { ascending: true }).order(key, { ascending: true })
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
    groups: catalog.groups.map(group => ({ id: group.id, n: group.title,
      w: catalog.words.filter(word => word.group_id === group.id).map(word =>
        [word.word, word.meaning, word.example, word.ipa ?? BRITISH_IPA[word.word] ?? ""])
    })),
    readings: catalog.readings.map(reading => ({ id: reading.id, t: reading.title,
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
  const sort_order = Number(draft.sort_order);
  if (draft.sort_order == null || draft.sort_order === "" || typeof draft.sort_order === "boolean" || !Number.isInteger(sort_order) || sort_order < 0 || sort_order > 2147483647) {
    throw new Error("Thứ tự phải là số nguyên không âm.");
  }
  if (entity === "words") {
    const word = text(draft.word, "Từ vựng", 200);
    if (originalKey && word !== originalKey) throw new Error("Không thể đổi định danh từ đã lưu.");
    if (!originalKey && catalog.words.some(row => row.word.toLocaleLowerCase("en") === word.toLocaleLowerCase("en"))) {
      throw new Error("Từ này đã tồn tại. Hãy sửa từ hiện có.");
    }
    if (!catalog.groups.some(group => group.id === draft.group_id)) throw new Error("Hãy chọn nhóm từ hợp lệ.");
    return { word, group_id: draft.group_id, meaning: text(draft.meaning, "Nghĩa", 2000),
      ipa: text(draft.ipa, "IPA", 500, false), example: text(draft.example, "Ví dụ", 5000, false), sort_order };
  }
  if (entity === "groups") return { title: text(draft.title, "Tên nhóm", 200), sort_order };
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
      passage: text(draft.passage, "Bài đọc", 100000), sort_order, questions };
  }
  throw new Error("Loại nội dung không hợp lệ.");
}

export function contentError(error) {
  if (error?.code === "23505") return "Nội dung này đã tồn tại. Hãy tải lại danh sách.";
  if (["23503", "23001"].includes(error?.code)) return "Nhóm còn từ vựng hoặc đã thay đổi. Hãy chuyển/xóa từ trong nhóm rồi thử lại.";
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
  const row = action === "delete" ? null : validateContent(entity, draft, action === "update" ? key : null, catalog);
  // A form supplies a stable ID so retrying a lost response cannot duplicate a create.
  const id = action === "create" && entity !== "words" ? (draft.id ? text(draft.id, "ID", 200) : makeId()) : key;
  let request;
  if (entity === "readings" && action !== "delete") {
    const { questions, ...passage } = row;
    request = client.rpc("save_reading_content", { p_id: id,
      p_create: action === "create", p_passage: passage, p_questions: questions });
  } else {
    request = client.from(definition.table);
    if (action === "delete") request = request.delete().eq(definition.key, key);
    else if (action === "update") {
      const { [definition.key]: ignored, ...changes } = row;
      request = request.update(changes).eq(definition.key, key);
    } else request = request.insert(entity === "groups" ? { ...row, id } : row);
    request = request.select(definition.key).single();
  }
  let result;
  try { result = await request.abortSignal(AbortSignal.timeout(15000)); }
  catch { throw new Error(contentError(null)); }
  const { error } = result;
  if (error) throw new Error(contentError(error));
}
