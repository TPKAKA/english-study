# Business English + Next.js + Supabase

Ứng dụng Next.js App Router và React chạy trên Vercel. Supabase lưu nội dung
bài học, tiến độ từ vựng và lịch sử bài đọc. Project: `qhupozxfvkgttuvdawbk`.

## Trạng thái hiện tại

- Đã tạo 6 bảng trên Supabase và nạp 6 nhóm, 42 từ, 2 bài đọc, 8 câu hỏi.
- Đã kiểm tra đọc được cả 4 bảng nội dung bằng publishable key.
- Đã đặt Site URL và Redirect URL thành
  `https://english-study-ikqettbu5-kaka-f7b5.vercel.app/`.
- Code tích hợp đã được cập nhật trong workspace, chưa commit/push hoặc deploy
  lại Vercel. Website đang online chưa có những thay đổi này.
- 17 kiểm tra Node với API giả lập đã đạt. Chưa kiểm tra giao diện bằng
  Playwright hoặc đăng nhập và ghi tiến độ bằng tài khoản Supabase thật.

## Kết nối

1. Mở project trong [Supabase Dashboard](https://supabase.com/dashboard/project/qhupozxfvkgttuvdawbk).
2. Trong **SQL Editor**, chạy `supabase/schema.sql` trước, rồi
   `supabase/seed.sql`. Hai file tạo 6 bảng và nạp 6 nhóm, 42 từ,
   2 bài đọc, 8 câu hỏi. Project hiện tại đã chạy cả hai file, không cần chạy lại.
   Chạy lại seed không ghi đè nội dung đã chỉnh sửa.
3. Trong **Vercel > Settings > Environment Variables**, giữ đúng hai biến:
   `url_db` = Supabase Project URL; `publishableKey` = Publishable key.
   Tên biến phân biệt hoa/thường, không cần đổi thành `NEXT_PUBLIC_...`.
   Trong ảnh bạn gửi, chúng chỉ bật cho **Production**; bật thêm **Preview**
   nếu muốn build các branch preview với Supabase. Mỗi môi trường cần đủ hai biến.
4. Bật **Email** trong **Authentication > Sign In / Providers**.
   Cho phép đăng ký người dùng mới để liên kết email có thể tạo tài khoản.
5. Trong **Authentication > URL Configuration**, Site URL và Redirect URL
   hiện đã dùng địa chỉ deployment bạn xác nhận:
   `https://english-study-ikqettbu5-kaka-f7b5.vercel.app/`.
   Khi deploy ra URL mới, cập nhật Site URL và thêm URL mới vào Redirect URLs
   trước khi thử đăng nhập. Nên dùng domain production ổn định của Vercel
   để tránh phải đổi cấu hình sau mỗi deployment.
6. Đăng nhập bằng email cần cấu hình **Custom SMTP** nếu người dùng không thuộc
   team Supabase. SMTP mặc định chỉ gửi đến email thành viên team và giới hạn
   số lần gửi. Xem [hướng dẫn SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
7. Commit/push các thay đổi và `package-lock.json` lên GitHub rồi deploy lại.
   `vercel.json` đã đặt preset **Next.js**, Build Command `npm run build`.
   Giữ Root Directory `./`; bỏ override Output Directory của bản HTML cũ
   nếu đã đặt trong dashboard để Next.js dùng output mặc định.
   Thay đổi biến môi trường chỉ có hiệu lực ở deployment mới.

`app/page.js` đọc hai biến trên server và chỉ chuyển các giá trị công khai
này cho giao diện React. Không có key hardcode trong mã nguồn. Publishable
key vẫn xuất hiện trong trình duyệt theo thiết kế của Supabase; RLS bảo vệ
dữ liệu. Không dùng database password, `sb_secret_...`, access token hoặc
`service_role`. Build production báo lỗi nếu thiếu/sai biến hoặc dùng khóa
đặc quyền. URL cũ `/business-english.html` chuyển hướng về `/`.

## Chạy trên máy

Cần Node.js 22 trở lên. Tạo `.env.local` dựa trên `.env.example` với đúng hai
giá trị của project Supabase. Next.js tự nạp file này. `.gitignore` loại trừ
`.env.local`, `node_modules` và `.next` khỏi Git.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`. Nếu chưa đặt cả hai biến, development vẫn cho học
với dữ liệu dự phòng và lưu tiến độ trên thiết bị. Nếu chỉ đặt một biến hoặc
giá trị không hợp lệ, ứng dụng báo lỗi cấu hình. Production yêu cầu đủ hai biến.
Để thử đăng nhập trên máy, thêm `http://localhost:3000/` vào Supabase Redirect URLs.

```bash
npm test
npm run build
npm start
```

## Sửa nội dung

Dùng **Table Editor** trong dashboard Supabase:

- `vocabulary_groups`: tên nhóm và `sort_order` để sắp xếp.
- `vocabulary_words`: từ, nhóm, nghĩa, ví dụ và thứ tự.
- `reading_passages`: tiêu đề, thời gian mục tiêu, bài đọc và thứ tự.
- `reading_questions`: bài đọc, câu hỏi, các lựa chọn, đáp án, giải thích.
  `answer_index` bắt đầu từ 0; `sort_order` bắt đầu từ 0.
- `vocabulary_progress`: trạng thái đã thuộc/chưa thuộc theo tài khoản.
- `reading_attempts`: đáp án, điểm và thời gian làm bài theo tài khoản.

Tải lại website để lấy nội dung mới. Nhóm chưa có từ và bài đọc chưa có câu hỏi
sẽ không hiển thị. Giữ `word` và ID bài đọc ổn định vì tiến độ gắn với các giá trị
này. Nội dung bài học được đọc công khai; frontend không có quyền sửa nội dung.
Các bảng tiến độ bật RLS để mỗi người chỉ đọc/ghi dữ liệu của chính họ.

`study-content.js` chứa bài học dự phòng khi chưa cấu hình, database rỗng
hoặc không tải được nội dung. File này cũng là nguồn để sinh seed:
`node scripts/generate-seed.cjs`. Chỉnh Table Editor không cập nhật bản dự phòng.

Không đăng nhập: tiến độ lưu trên thiết bị, tách riêng với dữ liệu tài khoản.
Đăng nhập cùng email ở thiết bị khác để tải tiến độ từ database. Thay đổi chưa
gửi được sẽ được giữ lại và thử gửi khi tải trang, có mạng trở lại hoặc bấm
**Đồng bộ lại**. Nút này cũng tải tiến độ mới từ thiết bị khác.
Lịch sử hiển thị 10 bài làm gần nhất. UUID ngăn tạo bản ghi trùng khi gửi lại.
Điểm được tính trên frontend cho mục đích tự học. Cache giữ cùng định dạng
và tên khóa với bản HTML để tiến độ trên cùng domain được giữ lại.

## Kiểm tra

`npm test` kiểm tra cấu hình môi trường, bài học, chấm điểm, cache, gửi lại,
đồng bộ giữa các phiên và đổi tài khoản bằng Node với API giả lập.

`node --env-file=.env.local scripts/check-connection.cjs` kiểm tra quyền đọc
các bảng nội dung trên project thật, không thay đổi database và không in key.

`node scripts/check-page.mjs` kiểm tra trang Next.js, các asset và chuyển
hướng từ URL HTML cũ qua HTTP khi server ở `http://localhost:3000` đang chạy.
Có thể đặt `TEST_URL` để kiểm tra một server khác. Playwright chưa được chạy.
Đăng nhập email, RLS và ghi dữ liệu bằng tài khoản thật vẫn cần xác nhận sau deploy.

Thử đăng nhập trên URL HTTPS của Vercel sau khi cấu hình redirect.

Tài liệu: [Next.js](https://nextjs.org/docs/app/getting-started/installation),
[biến môi trường Next.js](https://nextjs.org/docs/app/guides/environment-variables),
[biến môi trường Vercel](https://vercel.com/docs/environment-variables),
[JavaScript SDK](https://supabase.com/docs/reference/javascript/installing),
[API keys](https://supabase.com/docs/guides/api/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
