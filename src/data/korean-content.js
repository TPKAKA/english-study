import { DEFAULT_LANGUAGES } from "../lib/study/languages.js";
import { STUDY_CONTENT } from "./study-content.js";

const korean = (id, word, meaning, example, romanization, cloze_text, reading = "") =>
  [word, meaning, example, "", { id, language_code: "ko", romanization, reading, cloze_text, cloze_answer: word }];

export const KOREAN_CONTENT = {
  groups: [
    { id: "ko-daily", n: "Giao tiếp hằng ngày", language_code: "ko", w: [
      korean("ko-hello", "안녕하세요", "xin chào", "안녕하세요. 저는 민수입니다.", "annyeonghaseyo", "_____. 저는 민수입니다."),
      korean("ko-thanks", "감사합니다", "cảm ơn", "도와주셔서 감사합니다.", "gamsahamnida", "도와주셔서 _____."),
      korean("ko-school", "학교", "trường học", "저는 학교에 갑니다.", "hakgyo", "저는 _____에 갑니다.", "[학꾜]"),
      korean("ko-friend", "친구", "bạn bè", "친구를 만나요.", "chingu", "_____를 만나요."),
      korean("ko-time", "시간", "thời gian", "지금 시간이 있어요.", "sigan", "지금 _____이 있어요.")
    ] },
    { id: "ko-work", n: "Công việc", language_code: "ko", w: [
      korean("ko-company", "회사", "công ty", "회사에서 일해요.", "hoesa", "_____에서 일해요."),
      korean("ko-meeting", "회의", "cuộc họp", "오늘 회의가 있어요.", "hoeui", "오늘 _____가 있어요."),
      korean("ko-document", "문서", "tài liệu", "문서를 보내 주세요.", "munseo", "_____를 보내 주세요."),
      korean("ko-schedule", "일정", "lịch trình", "일정을 확인해요.", "iljeong", "_____을 확인해요."),
      korean("ko-deadline", "마감", "hạn chót", "마감은 내일이에요.", "magam", "_____은 내일이에요.")
    ] }
  ], readings: []
};

export const MULTILINGUAL_CONTENT = { languages: DEFAULT_LANGUAGES,
  groups: [...STUDY_CONTENT.groups, ...KOREAN_CONTENT.groups], readings: STUDY_CONTENT.readings };
