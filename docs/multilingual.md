# Đa ngôn ngữ

## Nâng cấp project đang dùng

Backup database trước khi nâng cấp. Trong Supabase SQL Editor chạy theo thứ tự:

1. `supabase/migrations/20261007_multilingual.sql`.
2. `supabase/korean-seed.sql` nếu muốn thêm 10 thẻ Hàn mẫu trong 2 nhóm.

Migration yêu cầu schema và các migration CRUD, import, SRS, luyện gõ trước đó
đã được chạy. Không chạy lại seed tiếng Anh cũ sau migration đa ngôn ngữ:
file cũ dùng khóa `word`, còn database mới dùng `id`.
Không chạy lại `schema.sql` hoặc các migration cũ sau migration đa ngôn ngữ:
chúng định nghĩa RPC dựa trên cột `word` cũ. Mọi nâng cấp tiếp theo dùng migration mới.
Migration và seed Hàn có thể chạy lại mà không đặt lại tiến độ hoặc ghi đè nội dung.
Agent chỉ kiểm thử trong database PostgreSQL cục bộ, không tự chạy SQL trên project thật.

Deploy code mới cùng migration. Không cần thêm biến môi trường. Deployment cũ
không hỗ trợ schema mới, vì vậy không tiếp tục dùng bản cũ để ghi dữ liệu.
Nếu chưa chạy migration, bản mới vẫn đọc database cũ theo chế độ tiếng Anh;
dropdown tiếng Hàn chỉ có trong dữ liệu dự phòng hoặc database đã nâng cấp.

Với database hoàn toàn mới: chạy `schema.sql`, seed tiếng Anh `seed.sql`,
các migration `20261006_content_crud.sql`, `20261006_vocabulary_import.sql`,
`20261007_spaced_repetition.sql`, `20261007_typing_practice.sql`,
rồi `20261007_multilingual.sql` và seed Hàn tùy chọn.

## Thêm ngôn ngữ

Đăng nhập admin, mở **Quản lý thẻ > Ngôn ngữ > Thêm**. Ví dụ tiếng Nhật:

| Trường | Giá trị |
| --- | --- |
| Tên ngôn ngữ | Tiếng Nhật |
| Mã ngôn ngữ | `ja` |
| Mã giọng đọc | `ja-JP` |
| Kiểu phiên âm | Cách đọc / Latin |
| Thứ tự | `2` |

Chọn ngôn ngữ mới trên đầu trang rồi tạo nhóm và thêm/import thẻ.
Lựa chọn ngôn ngữ được ghi nhớ trên thiết bị khi tải lại trang.
Không cần tạo bảng riêng, clone giao diện hay thêm biến môi trường cho từng ngôn ngữ.
Mã ngôn ngữ và ngôn ngữ của nhóm/bài đọc đã lưu không đổi được;
muốn chuyển ngôn ngữ hãy tạo nội dung mới. Xóa ngôn ngữ chỉ khi đã xóa hết
nhóm và bài đọc của nó. Quyền ghi vẫn dựa trên admin đã xác thực và RLS `content_editors`.

## Phiên âm, nghe và luyện gõ

Tiếng Anh dùng IPA và nguồn gợi ý hiện có. Tiếng Hàn dùng Hangul, cách đọc
(ví dụ `학교` có cách đọc `[학꾜]`) và phiên âm Latin tùy chọn.
Các ngôn ngữ mới không tự có nguồn tra phiên âm; admin nhập hoặc import dữ liệu này.
Nút nghe chọn giọng đúng `speech_locale`; nếu thiết bị không có giọng Hàn/Nhật,
nút nghe và chế độ nghe-viết bị vô hiệu hóa, không đọc bằng giọng Anh thay thế.
Khả năng phát âm tùy thuộc các giọng cài trên trình duyệt/hệ điều hành.

Đáp án xem nghĩa/nghe-viết là chữ gốc, không phải phiên âm Latin.
Gõ Hangul bằng IME không bị kiểm tra giữa lúc đang ghép chữ.
Với câu có trợ từ hoặc biến hình, nhập **Câu điền từ (chỗ trống _____)** và
**Đáp án điền từ** rõ ràng, ví dụ `저는 _____에 갑니다.` / `학교`.
Nếu bỏ cả hai trường, ứng dụng chỉ tự tạo chỗ trống khi từ xuất hiện nguyên dạng
trong câu ví dụ. Không tự đoán biến hình hay loại bỏ trợ từ.

Mẫu Excel/CSV được chọn theo ngôn ngữ. Cột tiếng Hàn:
`word, meaning, reading, romanization, example, cloze_text, cloze_answer`.
Chọn **Mẫu Excel** để tránh phụ thuộc mã hóa CSV của Excel.
File tiếng Anh 4 cột cũ vẫn import được. Import trùng chỉ xét trong nhóm đích;
các trường tùy chọn bị bỏ khỏi file được giữ nguyên khi cập nhật.

## Định danh và dữ liệu học

`vocabulary_words.id` là ID bất biến, `word` là chữ hiển thị có thể sửa.
ID các thẻ tiếng Anh hiện hữu giữ giá trị `word` cũ để cache trên thiết bị,
trạng thái đã thuộc, SRS và từ sai không bị mất khi nâng cấp.
Thẻ mới nhận ID riêng; import cập nhật giữ ID hiện có.
Hai thẻ cùng chữ ở nhóm/ngôn ngữ khác nhau có tiến độ riêng.

Trong database, ba bảng tiến độ dùng `card_id` tham chiếu ID thẻ.
API/cache vẫn gọi trường này là `word` vì tương thích dữ liệu đã lưu:
**giá trị trường này là ID thẻ, không phải chữ hiển thị**.
Các adapter database dùng alias `word:card_id` khi đọc.
Thẻ trong bộ học giữ bốn cột cũ `[word, meaning, example, ipa]` và có metadata
ở cột thứ năm `{ id, language_code, pronunciation_mode, reading, romanization,
cloze_text, cloze_answer }`. Truy cập ID qua helper `cardId()`.
Progress cũ mồ côi được giữ lại bằng FK `NOT VALID`; bản ghi mới vẫn phải
tham chiếu thẻ hợp lệ. Không tự xóa dữ liệu cũ trong migration.
