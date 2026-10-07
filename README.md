# Business English

Website học từ vựng và đọc hiểu, dùng Next.js App Router, React và Supabase.
Có IPA, gợi ý phiên âm khi thêm/import, phát âm, ôn tập ngắt quãng (SRS), luyện gõ đáp án, quản lý thẻ, đồng bộ tiến độ và đăng nhập bằng cookie HttpOnly.

## Cấu trúc thư mục

```text
english-study/
  src/
    app/                      # Next.js pages, layouts and API routes
      api/
      globals.css
      layout.js
      page.js
    components/               # React UI, grouped by feature
      admin/                  # Content manager and vocabulary importer
      auth/                   # Account password setup
      study/                  # Flashcards, typing practice, SRS and reading
      ui/                     # Shared dialog
    lib/                      # Application logic
      admin/                  # Admin permissions and CRUD handlers
      api/                    # Same-origin browser API client
      auth/                   # Auth handlers and HttpOnly cookies
      content/                # Catalog, content validation and updates
      study/                  # Sync, FSRS scheduling, scoring and pronunciation
      supabase/               # Environment config and server SDK client
      vocabulary/             # CSV, XLSX, batch import and IPA suggestions
    data/
      study-content.js        # Starter lessons and offline fallback
  public/
    templates/                # Downloadable CSV and XLSX templates
  supabase/
    migrations/               # Ordered database upgrades
    schema.sql
    seed.sql
    ipa-backfill.sql
  tests/                      # Node tests and fake Auth backend
    helpers/
  scripts/                    # Page/connection checks and SQL generation
  docs/
    setup.md                  # Supabase, Vercel, auth and import guide
  .env.example
  next.config.mjs
  package.json
  vercel.json
```

## Sửa Ở Đâu?

| Phần cần sửa | Thư mục/file |
| --- | --- |
| Trang và endpoint API | [src/app](src/app/) |
| Giao diện, màu sắc, bố cục | [globals.css](src/app/globals.css) |
| Thẻ từ vựng và bài đọc | [study-app.js](src/components/study/study-app.js) |
| Ôn tập và tính lịch FSRS | [srs-review.js](src/components/study/srs-review.js), [srs.js](src/lib/study/srs.js) |
| Luyện gõ, chấm đáp án và từ sai | [components/study/typing-practice.js](src/components/study/typing-practice.js), [lib/study/typing-practice.js](src/lib/study/typing-practice.js) |
| Form thêm/sửa/xóa và import | [components/admin](src/components/admin/) |
| Đăng nhập, cookie, chống CSRF | [lib/auth](src/lib/auth/) |
| API gọi từ trình duyệt | [api-client.js](src/lib/api/api-client.js) |
| Đồng bộ tiến độ và chấm điểm | [lib/study](src/lib/study/) |
| Kết nối và cấu hình Supabase | [lib/supabase](src/lib/supabase/) |
| Bài học mẫu/dự phòng | [study-content.js](src/data/study-content.js) |
| Schema và nâng cấp database | [supabase](supabase/) |

Tên file/thư mục dùng `kebab-case`. Giữ tên `page.js`, `layout.js`, `route.js`
theo quy ước Next.js. `src/app` chỉ chứa route, layout và CSS toàn cục;
component đặt trong `src/components`, logic dùng lại đặt trong `src/lib`.
Giữ `public`, các file cấu hình và `.env.local` ở thư mục gốc.

## Chạy Và Kiểm Tra

Cần Node.js 22 trở lên. Tạo `.env.local` theo [.env.example](.env.example);
giữ các biến `url_db`, `publishableKey`, `ADMIN_EMAIL` và `ADMIN_PASSWORD` tùy chọn.
Không commit `.env.local` hoặc đưa secret/service role key vào mã trình duyệt.

```bash
npm install
npm run dev
```

Mở [localhost:3000](http://localhost:3000). Chưa cấu hình Supabase vẫn học được
bằng dữ liệu dự phòng trong development; production cần đủ cấu hình.

| Lệnh | Mục đích |
| --- | --- |
| `npm test` | Kiểm thử bằng Auth/database giả lập, không ghi Supabase thật |
| `npm run build` | Build production |
| `npm start` | Chạy bản đã build |
| `npm run check:page` | Kiểm tra trang/API/file mẫu trên server đang chạy; có thể đặt `TEST_URL` |
| `npm run check:db` | Kiểm tra đọc nội dung từ Supabase bằng `.env.local`, không ghi dữ liệu |
| `npm run db:seed` | Sinh lại hai file SQL seed và IPA từ bài học mẫu, không tự chạy SQL trên Supabase |

Hướng dẫn migration, cấp quyền admin, đăng nhập, SMTP/OTP, import và deploy:
[Cấu hình và vận hành](docs/setup.md).

## Ôn Tập Ngắt Quãng

Mở **Ôn tập**, chọn nhóm và **Bắt đầu ôn**. Hiện đáp án rồi đánh giá
**Quên / Khó / Nhớ / Dễ** để tính lịch tiếp theo bằng TS-FSRS.
Trước khi đồng bộ lịch theo tài khoản, chạy một lần
[migration SRS](supabase/migrations/20261007_spaced_repetition.sql) trong Supabase SQL Editor.
Không cần biến môi trường mới. Chưa chạy migration vẫn lưu lịch trên thiết bị;
trạng thái **Đã thuộc** cũ giữ nguyên.

## Luyện Gõ Đáp Án

Tab **Luyện gõ** có ba chế độ: xem nghĩa, nghe và viết, điền từ vào câu ví dụ.
Các từ trả lời sai hoặc đã xem đáp án được lưu để luyện lại; trả lời đúng sẽ
loại từ đó khỏi danh sách sai. Có lọc nhóm, trộn từ và kết quả từng lượt.
Lưu trên thiết bị ngay, tách theo tài khoản, không tự sửa SRS hoặc cờ đã thuộc.
Để đồng bộ Supabase, chạy một lần
[migration luyện gõ](supabase/migrations/20261007_typing_practice.sql), rồi deploy bản mới.
Không cần thêm biến môi trường. Chi tiết cách chấm và lưu: [setup](docs/setup.md).
