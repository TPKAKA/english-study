# Cấu hình và vận hành Business English

Sơ đồ thư mục và các lệnh thường dùng: [README](../README.md).
Các lệnh và đường dẫn bên dưới được tính từ thư mục gốc của project.

Ứng dụng Next.js App Router và React chạy trên Vercel. Supabase lưu nội dung
bài học, tiến độ từ vựng và lịch sử bài đọc. Project: `qhupozxfvkgttuvdawbk`.

## Trạng thái hiện tại

- Đã tạo 6 bảng trên Supabase và nạp 6 nhóm, 42 từ, 2 bài đọc, 8 câu hỏi.
- Đã kiểm tra đọc được cả 4 bảng nội dung bằng publishable key.
- Site URL và Redirect URL trước đây dùng deployment HTML cũ `ikqettbu5`.
  Ảnh mới có bản Next.js tại `https://english-study-mp3kf4pyh-kaka-f7b5.vercel.app/`;
  cần cập nhật URL Configuration để email không đưa về giao diện cũ.
- Workspace có IPA Anh-Anh, nút nghe, CRUD và import thẻ Excel/CSV/TSV có xem trước.
- Đăng nhập chính dùng email + mật khẩu qua Supabase Auth, không redirect.
  Tài khoản chưa có mật khẩu xác thực email bằng mã OTP một lần, rồi đặt mật khẩu.
  Có tùy chọn áp dụng `ADMIN_PASSWORD` trên server cho đúng admin đã xác thực.
- Migration CRUD, IPA và import chưa được chạy trên Supabase thật bởi agent.
  Cần chạy các bước nâng cấp bên dưới và deploy lại để dùng trên Vercel.
- Phiên đăng nhập dùng cookie HttpOnly do API Next.js quản lý, không đưa token
  vào JavaScript. Đăng nhập/đồng bộ/quản trị được kiểm tra với Auth giả lập;
  không dùng tài khoản Supabase thật trong kiểm thử.

## Kết nối

1. Mở project trong [Supabase Dashboard](https://supabase.com/dashboard/project/qhupozxfvkgttuvdawbk).
2. Project hiện tại đã có schema và dữ liệu ban đầu: chỉ chạy các bước
   **Nâng cấp IPA và CRUD** bên dưới, không cần nạp lại seed.
   Với project hoàn toàn mới, chạy lần lượt `supabase/schema.sql`,
   `supabase/migrations/20261006_content_crud.sql`,
   `supabase/migrations/20261006_vocabulary_import.sql`,
   `supabase/migrations/20261007_spaced_repetition.sql`,
   `supabase/migrations/20261007_typing_practice.sql`, rồi `supabase/seed.sql`.
   Seed nạp 6 nhóm, 42 từ, 2 bài đọc, 8 câu hỏi, không ghi đè bản ghi đã có.
   Nếu chạy lại `schema.sql`, phải chạy lại migration sau đó để khôi phục
   quyền ghi cho editor.
3. Trong **Vercel > Settings > Environment Variables**, giữ đúng hai biến:
   `url_db` = Supabase Project URL; `publishableKey` = Publishable key.
   Tên biến phân biệt hoa/thường, không cần đổi thành `NEXT_PUBLIC_...`.
   Trong ảnh bạn gửi, chúng chỉ bật cho **Production**; bật thêm **Preview**
   nếu muốn build các branch preview với Supabase. Mỗi môi trường cần đủ hai biến.
   Thêm `ADMIN_EMAIL` = email quản trị cho môi trường cần quản lý nội dung.
   Biến này chỉ đọc trên server, không đặt tiền tố `NEXT_PUBLIC_`.
   Không có `ADMIN_EMAIL` vẫn học được, nhưng API quản trị từ chối cấp quyền.
   `ADMIN_PASSWORD` là biến server tùy chọn để đặt mật khẩu admin ban đầu,
   không dùng tiền tố `NEXT_PUBLIC_`; xem phần Đăng nhập bằng mật khẩu bên dưới.
4. Bật **Email** trong **Authentication > Sign In / Providers**.
   Cho phép đăng ký người dùng mới để liên kết email có thể tạo tài khoản.
5. Đăng nhập bằng mật khẩu hoặc nhập mã email trong bản mới không chuyển
   hướng, nên không phụ thuộc URL deployment. Nếu vẫn dùng link xác thực hoặc
   link đặt lại mật khẩu, trong **Authentication > URL Configuration**, đặt **Site URL** và thêm
   **Redirect URL** là domain đang chạy bản Next.js mới (có Tài khoản, IPA,
   Quản lý thẻ), không dùng deployment HTML cũ `ikqettbu5`.
   Nếu dùng magic link, thêm Redirect URL `https://DOMAIN/api/auth/callback`.
   Callback dùng PKCE và đổi code lấy phiên trên server, không đưa token vào URL.
   Nên lấy domain production cố định ở **Vercel > Settings > Domains** và dùng
   domain đó cho cả hai trường để không phải thay URL sau mỗi deployment.
   Supabase cần cho phép đúng URL đó; nếu email template tùy chỉnh đang hardcode Site URL cũ,
   kiểm tra template theo [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
   Sau khi đổi, mở bản mới và yêu cầu một liên kết đăng nhập mới; không dùng
   lại email/link cũ. Không chia sẻ URL có `access_token` hoặc `refresh_token`.
   Nếu đã lộ link, thu hồi phiên liên quan trong Supabase Auth và đăng nhập lại.
6. Đăng nhập bằng email cần cấu hình **Custom SMTP** nếu người dùng không thuộc
   team Supabase. SMTP mặc định chỉ gửi đến email thành viên team và giới hạn
   số lần gửi. Xem [hướng dẫn SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
7. Commit/push các thay đổi và `package-lock.json` lên GitHub rồi deploy lại.
   `vercel.json` đã đặt preset **Next.js**, Build Command `npm run build`.
   Giữ Root Directory `./`; bỏ override Output Directory của bản HTML cũ
   nếu đã đặt trong dashboard để Next.js dùng output mặc định.
   Thay đổi biến môi trường chỉ có hiệu lực ở deployment mới.

`src/app/page.js` đọc hai biến Supabase trên server và chỉ chuyển các giá trị công khai
này cho giao diện React. `ADMIN_EMAIL` được đối chiếu tại API server `/api/admin`,
không chuyển qua props hoặc gửi email cấu hình về trình duyệt.
`ADMIN_PASSWORD` chỉ đọc trên server `/api/admin/password`; API không trả về
mật khẩu. Form đăng nhập/đổi mật khẩu gửi đến API Next.js cùng origin qua HTTPS;
server gọi Supabase Auth. Không đưa mật khẩu vào cookie, cache tiến độ hoặc log.
Không có key hardcode trong mã nguồn. Publishable
key vẫn xuất hiện trong trình duyệt theo thiết kế của Supabase; RLS bảo vệ
dữ liệu. Không dùng database password, `sb_secret_...`, access token hoặc
`service_role`. Build production báo lỗi nếu thiếu/sai biến hoặc dùng khóa
đặc quyền. URL cũ `/business-english.html` chuyển hướng về `/`.

## Chạy trên máy

Cần Node.js 22 trở lên. Tạo `.env.local` dựa trên `.env.example` với hai
giá trị của project Supabase và `ADMIN_EMAIL` để dùng quản trị trên máy.
Next.js tự nạp file này. `.gitignore` loại trừ
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

## Đăng nhập bằng mật khẩu

Tài khoản đã có mật khẩu: mở **Tài khoản**, nhập email + mật khẩu và bấm
**Đăng nhập**. Ứng dụng dùng `signInWithPassword`, lấy phiên Supabase thật,
không so sánh một chuỗi mật khẩu trên frontend để cấp quyền. Quyền CRUD
vẫn cần email xác nhận khớp `ADMIN_EMAIL` và grant `content_editors`.

Tài khoản admin hiện chưa có mật khẩu: cấu hình `ADMIN_EMAIL` và biến riêng
`ADMIN_PASSWORD` trên Vercel, rồi deploy bản mới. Giá trị không hardcode trong
repo. Mật khẩu cần 8 đến 128 ký tự và được Supabase chấp nhận theo chính sách
password của project. Mật khẩu dễ đoán chỉ nên dùng tạm, rồi đổi ngay.

Thiết lập lần đầu, không cần link redirect:

1. Trong **Supabase > Authentication > Email Templates**, sửa **Magic Link**
   để có mã `{{ .Token }}`. Nếu tài khoản mới chưa xác nhận, thêm mã vào cả
   **Confirm Signup**. Ví dụ phần nội dung email:

```html
<h2>Business English</h2>
<p>Ma xac thuc: <strong>{{ .Token }}</strong></p>
```

2. Ở bản Next.js mới: mở **Tài khoản**, nhập email, mở **Mã xác thực email**,
   bấm **Gửi mã xác thực**, lấy mã trong email, nhập mã và bấm **Xác nhận**.
   Không nhấn link về deployment cũ. OTP cũng là cách khôi phục truy cập khi
   quên mật khẩu; không thay đổi mật khẩu chỉ bằng email chưa xác thực.
3. Sau khi đăng nhập, mở **Đặt / đổi mật khẩu**. Admin bấm **Dùng mật khẩu
   mặc định** và xác nhận để server áp dụng `ADMIN_PASSWORD` vào đúng tài khoản
   đang đăng nhập. Hoặc tự nhập mật khẩu mới hai lần và bấm **Lưu mật khẩu**.
   Áp dụng biến môi trường yêu cầu JWT thật và email đã xác nhận khớp
   `ADMIN_EMAIL`, không cần grant CRUD để thiết lập mật khẩu tài khoản của mình.
   Server gọi Auth bằng JWT của người dùng và publishable key, không cần
   service role. Không thể chọn user khác hoặc thay mật khẩu qua body request.
4. Sau đó đăng xuất, đăng nhập lại bằng email + mật khẩu. Có thể xóa biến
   `ADMIN_PASSWORD` và redeploy để bỏ nút thiết lập mặc định; mật khẩu đã lưu
   trong Supabase vẫn dùng được. Thay biến môi trường không tự thay mật khẩu
   mỗi lần deploy hoặc mở trang: chỉ áp dụng sau thao tác xác nhận của admin.

Nếu Supabase yêu cầu phiên mới khi đổi mật khẩu, xác thực email bằng mã lại
trước khi thử. Mã OTP và mật khẩu không được lưu vào snapshot/cache của app.
Không gửi mật khẩu, mã OTP hoặc link có token vào chat.

### Duy trì đăng nhập

Sau khi đăng nhập bằng mật khẩu hoặc OTP, API lưu phiên vào cookie `HttpOnly`,
host-only, `Path=/`, `SameSite=Lax`, `Secure` và tiền tố `__Host-` trên HTTPS.
Cookie có thời hạn 30 ngày, được gia hạn khi server làm mới phiên. Access token
hết hạn được server làm mới bằng refresh token; không cần đăng nhập mỗi ngày
nếu phiên Supabase vẫn còn hiệu lực. Mật khẩu và OTP không lưu vào cookie.
Trình duyệt chỉ nhận user ID/email và mã chống CSRF, không nhận access/refresh
token trong JSON, localStorage hoặc Authorization header. Cookie phiên chỉ
được đọc bởi server; tiến độ offline vẫn giữ trong localStorage theo tài khoản.

Các API ghi yêu cầu cùng origin, JSON và `X-CSRF-Token` khớp cookie nonce;
chặn request cross-origin/cross-site, bao gồm đăng nhập và đăng xuất.
Mỗi request tạo client riêng, xác minh người dùng bằng Supabase `getUser()`;
quản trị vẫn kiểm tra email/grant và giữ RLS. `/api/progress` lấy user ID từ
phiên đã xác minh, kiểm tra dữ liệu và tính lại điểm bài đọc trên server.
API auth/riêng tư không được cache (`private, no-store`, `Vary: Cookie`).
HTML bài học dùng chung không chứa cookie hay dữ liệu riêng của người dùng.
Tab đang mở nhận thông báo đăng nhập/đăng xuất qua BroadcastChannel không có
token; khi quay lại tab và định kỳ 10 phút, app kiểm tra/làm mới phiên.

Nâng cấp từ phiên cũ: đăng nhập lại một lần. Cookie JavaScript và localStorage
auth cũ của cùng project được xóa, không tự chuyển token cũ vào phiên mới.
Đăng xuất thu hồi phiên hiện tại và xóa các cookie phiên, không xóa tiến độ học.
Dùng cùng domain production cố định của Vercel: cookie không chuyển giữa
hostname khác nhau. Xóa cookie, dùng cửa sổ ẩn danh, đổi thiết bị/domain hoặc
phiên bị thu hồi/hết hạn theo chính sách Supabase sẽ cần đăng nhập lại.
Bật cho phép cookie cho website này. Localhost dùng cookie HttpOnly không
Secure để phát triển qua HTTP; production phải dùng HTTPS.

HttpOnly giảm nguy cơ script đọc/lấy cắp token, không ngăn mọi cuộc tấn công.
XSS vẫn có thể thao tác qua phiên đang mở; extension độc hại/máy nhiễm mã độc
vẫn là rủi ro. Không render HTML không tin cậy, dùng mật khẩu mạnh và không
chia sẻ link/token. Không có SQL migration hay biến môi trường mới cho nâng cấp này.

## Nâng cấp IPA và CRUD

Trên project hiện tại, mở **SQL Editor** và chạy theo thứ tự:

1. `supabase/migrations/20261006_content_crud.sql`: thêm cột `ipa`, bảng
   `content_editors`, chính sách RLS ghi và function `save_reading_content`.
   Không xóa/nạp lại dữ liệu bài học hoặc tiến độ. Nhóm có từ sẽ không được
   xóa; phải chuyển hoặc xóa các từ trước. Bài đọc và câu hỏi được lưu nguyên tử.
2. `supabase/ipa-backfill.sql`: điền IPA cho 42 từ ban đầu nếu IPA đang trống.
   Không ghi đè IPA đã chỉnh sửa, không thêm lại từ đã xóa.
3. `supabase/migrations/20261006_vocabulary_import.sql`: thêm RPC import nguyên
   tử và unique index không phân biệt chữ hoa/thường cho từ vựng. Không xóa từ
   hoặc tiến độ. Nếu database đã có từ trùng theo chữ hoa/thường/khoảng trắng,
   migration dừng để tránh tự gộp/xóa dữ liệu. Kiểm tra bằng truy vấn sau và
   xử lý các bản ghi trùng trước khi chạy lại:

```sql
select lower(btrim(word)) as normalized_word, array_agg(word) as variants
from public.vocabulary_words
group by lower(btrim(word))
having count(*) > 1;
```

4. Trên Vercel, thêm `ADMIN_EMAIL` với email quản trị được chọn và redeploy.
   Đặt cùng biến này trong `.env.local` nếu thử quản trị trên máy.
   Bật **Confirm Email** trong Supabase Auth; xác thực đúng email quản trị
   rồi đăng nhập bằng mã email hoặc mật khẩu. Sau khi tài khoản tồn tại trong
   **Authentication > Users**, thay `YOUR_EMAIL_HERE` trong SQL bên dưới
   bằng đúng email được cấp quyền và chạy trong SQL Editor:

```sql
insert into public.content_editors (user_id)
select id from auth.users
where lower(email) = lower('YOUR_EMAIL_HERE')
on conflict (user_id) do nothing
returning user_id;
```

Nếu không có dòng trả về, tài khoản có thể đã có grant từ trước, hoặc email
chưa tồn tại. Kiểm tra `content_editors` và **Authentication > Users**.
Trong website, mở **Quản lý thẻ** và bấm **Kiểm tra quyền**, hoặc tải lại trang.
CRUD trên website yêu cầu đồng thời: email đã xác nhận khớp `ADMIN_EMAIL`
và user ID đã được cấp quyền trong `content_editors`. Chỉ thêm biến Vercel
không tự tạo tài khoản hoặc thêm grant trong Supabase. Tài khoản thường
và người chưa đăng nhập chỉ đọc bài học và lưu tiến độ của mình.
Frontend không thể tự thêm người vào `content_editors`, kể cả editor.
Thu hồi quyền bằng cách xóa đúng dòng `user_id` trong Table Editor.
API kiểm tra token với Supabase `auth.getUser(token)` và đối chiếu email
trên server trước mỗi lần ghi. API tạo một client riêng cho từng request,
chỉ dùng publishable key và JWT của người đăng nhập, không dùng service role.
RLS trên database tiếp tục kiểm tra quyền cho từng lần ghi.
`ADMIN_EMAIL` giới hạn truy cập API website; RLS vẫn dựa trên các grant user ID
trong `content_editors`. Người có grant có thể gọi Supabase trực tiếp.
Khi thay quản trị viên, thu hồi grant của các tài khoản không còn được phép
sửa nội dung và cấp grant cho tài khoản mới, bên cạnh cập nhật biến Vercel.
Không đưa service role key vào website.

Giữ nguyên `url_db` và `publishableKey`, thêm `ADMIN_EMAIL` trên Vercel,
commit/push rồi redeploy.
Các thay đổi trong workspace không tự cập nhật deployment đang online.
Nếu liên kết đăng nhập không quay về URL website đang dùng, kiểm tra
**Authentication > URL Configuration** như phần Kết nối.

## Quản lý nội dung

Màn hình **Quản lý thẻ** có tìm kiếm, lọc nhóm, phân trang, thêm/sửa/xóa từ,
nhóm từ và bài đọc. Form từ có nghĩa, IPA, ví dụ, nhóm và thứ tự.
Form bài đọc có thêm/xóa/sắp xếp câu hỏi, lựa chọn, đáp án đúng và giải thích.
Xóa từ hoặc bài đọc cần xác nhận. Xóa bài đọc sẽ xóa câu hỏi đi kèm,
không xóa lịch sử bài làm. Nội dung vừa lưu sẽ được tải lại trong ứng dụng.
Lỗi ghi không được đưa vào hàng đợi offline; form giữ nội dung để sửa/thử lại.

Nút **Thêm thẻ** và **Import thẻ** nằm ngay phía trên các nhóm từ trong màn
hình học. Khi chưa đăng nhập/cấp quyền, các nút mở màn hình quản lý với nút
**Đăng nhập** hoặc **Kiểm tra quyền**. Admin thấy biểu tượng bút và thùng rác
bên dưới thẻ hiện tại, cạnh nút nghe, để mở form sửa hoặc xác nhận xóa.

### Import thẻ

Chạy migration import ở trên một lần trước khi sử dụng. Chọn file `.xlsx`,
`.csv`/`.tsv` hoặc dán dữ liệu, chọn nhóm và bấm **Xem trước**, rồi **Import thẻ**.
Tối đa 500 thẻ và 1 MB mỗi lần; không hỗ trợ `.xls` cũ hoặc gói Anki.

Trong Excel, dùng nút **Mẫu Excel** để tải [vocabulary.xlsx](../public/templates/vocabulary.xlsx).
File có bốn cột `word`, `meaning`, `ipa`, `example`, giữ nguyên tiếng Việt và IPA.
Sửa/thêm các dòng rồi lưu lại dưới dạng `.xlsx` và import trực tiếp, không cần
đổi sang CSV. Import đọc trang tính đầu tiên; các ô cần chứa văn bản.
Giữ dữ liệu trong 2000 dòng đầu và 32 cột đầu, không thêm trang tính không liên quan.
File nén giải nén vượt 8 MB hoặc hơn 256 thành phần bị từ chối trước khi đọc.

Nút **Mẫu CSV** vẫn tải [CSV UTF-8 có BOM](../public/templates/vocabulary.csv).
CSV/TSV hỗ trợ UTF-8/UTF-16LE/UTF-16BE có BOM, bỏ qua dòng `sep=` nếu có.
Không đoán mã hóa ANSI để tránh nhập sai dữ liệu. Nếu cần CSV trong Excel,
dùng **Data > From Text/CSV**, chọn **65001: Unicode (UTF-8)** và dấu phân cách
**Comma**; lưu lại bằng **CSV UTF-8 (Comma delimited) (*.csv)**.
Endpoint CSV Unicode cũ `/api/vocabulary-template` vẫn được giữ tương thích,
nhưng `.xlsx` là mẫu dành cho Excel để không phụ thuộc vào nhận diện mã hóa CSV.

```csv
word,meaning,ipa,example
collaborate,hợp tác,/kəˈlæbəreɪt/,We collaborate with the design team.
```

Có tiêu đề: cần `word` và `meaning`; `ipa` và `example` tùy chọn, thứ tự cột
có thể thay đổi. Chấp nhận tên cột `Từ`, `Nghĩa`, `Phiên âm`, `Ví dụ`.
Không có tiêu đề: thứ tự là `word,meaning,ipa,example`, ít nhất hai cột đầu.
Tự nhận diện dấu phẩy, dấu chấm phẩy hoặc tab; có thể chọn thủ công.
Ví dụ chứa dấu phẩy/xuống dòng cần đặt trong dấu ngoặc kép đúng chuẩn CSV.

Mặc định **Bỏ qua** từ đã có. Chọn **Cập nhật** để sửa nghĩa/IPA/ví dụ và
chuyển từ vào nhóm được chọn, giữ nguyên khóa `word` và liên kết tiến độ.
Cột IPA/ví dụ không có trong file sẽ giữ giá trị cũ khi cập nhật; cột có mặt
nhưng trống sẽ xóa giá trị đó. Từ mới/chuyển nhóm được đặt cuối nhóm.
Từ bị lặp trong cùng file hoặc bản ghi không hợp lệ chặn cả lần import.
Preview không ghi database. Server kiểm tra lại toàn bộ dữ liệu và quyền
trước một RPC duy nhất; lỗi SQL rollback toàn bộ batch. Nếu mất kết nối sau
khi gửi, tải lại danh sách trước khi thử lại để xác nhận kết quả.

`word` là khóa chính của schema hiện tại nên không đổi chữ của từ đã lưu
trong form sửa, tránh làm mất liên kết tiến độ. Có thể sửa nghĩa, IPA, ví dụ,
nhóm và thứ tự. ID nhóm/bài đọc mới được sinh tự động. Khi cần thay một từ,
xóa và thêm từ khác; tiến độ cũ không chuyển sang từ mới.

### Gợi ý IPA

Trong form thêm/sửa từ, nhập từ rồi bấm **Tra IPA**, chọn phiên âm và bấm
**Áp dụng IPA** (hoặc **Thay IPA** khi đã có phiên âm). Có thể sửa thủ công trước
khi lưu. Đổi từ trong khi đang tra sẽ bỏ kết quả của từ cũ.

Trong import, bấm **Xem trước** rồi **Gợi ý IPA**. Chỉ tra thẻ thêm/cập nhật còn
thiếu IPA, không tra thẻ bỏ qua hoặc thay IPA đã có trong file/database.
Chọn phiên âm từng dòng; **Áp dụng gợi ý** cập nhật bản xem trước, chưa ghi database.
**Import thẻ** lưu bản xem trước và các gợi ý đã chọn. Dòng không chọn giữ nguyên.
Tra theo từng lượt tối đa 20 từ; có thể dừng, đổi file hoặc thử lại lượt lỗi.

Không cần biến môi trường, API key hoặc migration mới cho tính năng gợi ý.
API `/api/admin/ipa` dùng cookie HttpOnly, CSRF, email admin và grant editor như CRUD.
Server chỉ gửi từ cần tra đến [Dictionary API](https://dictionaryapi.dev/), không gửi
email, cookie, token hoặc key Supabase. Các từ mẫu có thể dùng bộ IPA có sẵn.
Gợi ý có nhãn UK/US khi nhận diện được từ audio đi kèm; nếu không, ghi rõ chưa rõ giọng.
Từ điển có thể thiếu cụm từ hoặc tạm ngừng hoạt động; vẫn nhập/lưu IPA thủ công được.
Không tự ghép phiên âm từ các từ khác cho một cụm từ mới. Cache có giới hạn,
lưu trong bộ nhớ server, không lưu kết quả gợi ý vào database cho đến khi xác nhận.

IPA của bộ từ mẫu dùng cách phát âm Anh-Anh; IPA cụm từ được ghép từ các từ thành phần,
trọng âm thực tế có thể thay đổi theo ngữ cảnh. Tham khảo
[ký hiệu phát âm Oxford](https://www.oxfordlearnersdictionaries.com/us/about/english/pronunciation_english)
và [reschedule](https://www.oxfordlearnersdictionaries.com/definition/english/reschedule).
Màn hình học ưu tiên IPA đã lưu trong database. Nếu IPA thiếu, trống hoặc chỉ
có khoảng trắng, các từ trong bộ 42 từ mẫu dùng phiên âm Anh-Anh dự phòng;
tra cứu không phân biệt chữ hoa/thường và khoảng trắng giữa các từ.
Đây chỉ là dự phòng hiển thị, không ghi đè database hoặc thêm lại từ đã xóa.
IPA của từ mới ngoài bộ mẫu cần nhập thủ công và có thể bổ sung sau. Nút nghe sử dụng
Speech Synthesis của thiết bị với `en-GB`; giọng và khả năng phát âm phụ
thuộc trình duyệt/hệ điều hành. IPA vẫn hiển thị nếu thiết bị không có giọng đọc.

Vẫn có thể sửa dữ liệu qua **Table Editor** trong dashboard Supabase:

- `vocabulary_groups`: tên nhóm và `sort_order` để sắp xếp.
- `vocabulary_words`: từ, nhóm, nghĩa, IPA, ví dụ và thứ tự.
- `reading_passages`: tiêu đề, thời gian mục tiêu, bài đọc và thứ tự.
- `reading_questions`: bài đọc, câu hỏi, các lựa chọn, đáp án, giải thích.
  `answer_index` bắt đầu từ 0; `sort_order` bắt đầu từ 0.
- `vocabulary_progress`: trạng thái đã thuộc/chưa thuộc theo tài khoản.
- `reading_attempts`: đáp án, điểm và thời gian làm bài theo tài khoản.

Tải lại nội dung trong Quản lý hoặc tải lại website để lấy thay đổi từ dashboard.
Nhóm chưa có từ vẫn xuất hiện để thêm từ; bài đọc chưa có câu hỏi chỉ xuất hiện
trong Quản lý, chưa đưa vào phần học. Giữ `word` và ID bài đọc ổn định vì tiến độ
gắn với các giá trị này. Nội dung bài học được đọc công khai; quyền ghi giới hạn
cho editor. Các bảng tiến độ bật RLS để mỗi người chỉ đọc/ghi dữ liệu của chính họ.

`src/data/study-content.js` chứa bài học dự phòng khi chưa cấu hình hoặc không tải được
nội dung. Database tải thành công nhưng rỗng được hiển thị đúng trạng thái rỗng,
không khôi phục các bài đã xóa. `node scripts/generate-seed.cjs` sinh `seed.sql`
và `ipa-backfill.sql`. Chỉnh dữ liệu Supabase không cập nhật bản dự phòng.
Seed là công cụ khởi tạo, không chạy lại sau khi cố ý xóa nội dung mẫu vì sẽ thêm
lại các bản ghi mẫu đang thiếu; backfill không có hành vi này.

Không đăng nhập: tiến độ lưu trên thiết bị, tách riêng với dữ liệu tài khoản.
Đăng nhập cùng tài khoản ở thiết bị khác để tải tiến độ từ database. Thay đổi chưa
gửi được sẽ được giữ lại và thử gửi khi tải trang, có mạng trở lại hoặc bấm
**Đồng bộ lại**. Nút này cũng tải tiến độ mới từ thiết bị khác.
Lịch sử hiển thị 10 bài làm gần nhất. UUID ngăn tạo bản ghi trùng khi gửi lại.
Điểm hiển thị được tính trên frontend; API tính lại điểm trước khi lưu. Cache giữ cùng định dạng
và tên khóa với bản HTML để tiến độ trên cùng domain được giữ lại.

## Ôn tập ngắt quãng (SRS)

### Nâng cấp database

Chạy một lần [20261007_spaced_repetition.sql](../supabase/migrations/20261007_spaced_repetition.sql)
trong **Supabase > SQL Editor**, rồi deploy bản mới. Migration tạo bảng
`vocabulary_srs` và RPC `save_vocabulary_srs`, không nạp lại bài học hoặc xóa tiến độ cũ.
Có thể chạy lại an toàn. Agent chỉ kiểm thử SQL bằng PostgreSQL trong bộ nhớ,
chưa chạy migration trên Supabase thật. Không cần key hay biến môi trường mới.
Nếu chưa nâng cấp hoặc mất mạng, lịch ôn vẫn lưu trên thiết bị và báo chưa đồng bộ;
đăng nhập, CRUD và tiến độ đã thuộc vẫn hoạt động độc lập.

### Học và lưu lịch

Mở **Ôn tập** để xem từ đến hạn và từ mới, lọc theo nhóm rồi bấm **Bắt đầu ôn**
hoặc chọn một từ trong danh sách. IPA vẫn hiển thị, có nút nghe phát âm.
Sau **Hiện đáp án**, chọn **Quên / Khó / Nhớ / Dễ**. Mỗi nút hiển thị khoảng
thời gian đến lần ôn tiếp theo; đánh giá xong tự chuyển sang thẻ kế tiếp.
Từ chưa có lịch được xem là từ mới, kể cả từ đã đánh dấu **Đã thuộc** trước đây.
SRS không sửa hay suy đoán lịch từ trạng thái đã thuộc/chưa thuộc cũ.

Lịch dùng [TS-FSRS](https://github.com/open-spaced-repetition/ts-fsrs), phiên bản
`5.4.2`, mục tiêu ghi nhớ 90%, không dùng fuzz ngẫu nhiên. Các bước học mặc định
là 1 phút và 10 phút, bước học lại 10 phút; thời gian thực tế phụ thuộc mức đánh giá
và lịch sử ôn. Hàng đợi cập nhật mỗi 15 giây và khi trở lại cửa sổ.
**Đã ôn hôm nay** đếm số từ khác nhau có lần đánh giá gần nhất trong ngày theo
giờ địa phương, không phải tổng số lượt bấm. Bộ lọc nhóm áp dụng cho cả ba bộ đếm.

Không đăng nhập: lịch lưu trong cache thiết bị. Đăng nhập: lịch tách riêng theo
tài khoản, không tự nhập lịch khách vào tài khoản. Đánh giá được giữ trong hàng
đợi cục bộ trước khi gửi, thử lại khi tải trang, có mạng trở lại hoặc bấm nút đồng bộ.
API `/api/srs` dùng cookie HttpOnly, kiểm tra CSRF và xác thực người dùng như tiến độ;
người học không cần quyền editor. Server tính lại FSRS, không nhận lịch kết quả
tự khai báo hoặc cho phép chọn chủ sở hữu khác. RLS giới hạn mỗi người đọc/ghi
lịch của chính mình. Cache lịch không chứa mật khẩu hay token.

Khi hai thiết bị đánh giá cùng một từ, bản có `reviewed_at` mới hơn được giữ lại;
gửi lại bản cũ hoặc đúng cùng timestamp không ghi đè lịch đã lưu. Đây là hợp nhất
trạng thái gần nhất, không kết hợp hai chuỗi lịch sử ôn đồng thời. Chưa có bảng
lịch sử từng lượt đánh giá hoặc cá nhân hóa tham số FSRS từ toàn bộ lịch sử.
Giữ đồng hồ thiết bị đúng; server từ chối đánh giá ở tương lai quá 5 phút.
Xóa từ hoặc tài khoản sẽ xóa lịch liên quan bằng khóa ngoại.

## Luyện gõ đáp án

Chạy một lần [20261007_typing_practice.sql](../supabase/migrations/20261007_typing_practice.sql)
trong Supabase SQL Editor, rồi deploy bản mới để đồng bộ danh sách từ sai.
Migration tạo `vocabulary_practice` và RPC `save_vocabulary_practice`, chạy lại
không xóa dữ liệu. Không cần biến môi trường hoặc dịch vụ bên ngoài mới.
Agent chưa chạy SQL trên Supabase thật; kiểm thử dùng database trong bộ nhớ.
Chưa chạy migration hoặc mất mạng vẫn luyện và lưu kết quả trên thiết bị.

Mở **Luyện gõ**, chọn kiểu luyện, nhóm và bấm **Bắt đầu luyện**. **Xem nghĩa**
hiển thị nghĩa tiếng Việt; **Nghe và viết** dùng phát âm `en-GB` của thiết bị,
không hiện chữ/IPA trước khi kiểm tra. **Điền từ** che tất cả lần xuất hiện
của đúng từ/cụm từ trong câu ví dụ. Chỉ dùng câu có khớp nguyên từ, không đoán
biến thể như `resign/resigned` hoặc `expense/expenses`; bộ mẫu có 37/42 câu phù hợp.
Từ thiếu ví dụ hoặc không khớp vẫn dùng được ở hai chế độ còn lại.

**Kiểm tra** so khớp chính xác với từ trong thẻ, bỏ qua chữ hoa/thường,
khoảng trắng thừa và dạng dấu nháy/gạch nối Unicode tương đương. Không chấp nhận
lỗi chính tả gần giống, từ thiếu/thừa hoặc tự chọn từ đồng nghĩa. Không bỏ dấu
câu: `invoice.` khác `invoice`. Có thể dùng Enter để kiểm tra và sang câu tiếp.
Sau khi chấm hiện đáp án, IPA, nghĩa và ví dụ; âm thanh phụ thuộc trình duyệt/hệ điều hành.

Trả lời sai hoặc **Xem đáp án** giữ từ trong **Từ cần luyện lại**.
**Luyện lại từ sai** hoặc nút luyện ở từng dòng bắt đầu lượt mới; trả lời đúng
ở bất kỳ chế độ nào sẽ bỏ từ khỏi danh sách sai. Bộ lọc chế độ/nhóm áp dụng
cho cả số lượng và danh sách. Thống kê đúng/sai là của lượt đang luyện;
reload kết thúc lượt nhưng không xóa danh sách từ sai. Chưa có lịch sử mọi lượt.
Luyện gõ không tự thay đổi SRS hoặc trạng thái đã thuộc/chưa thuộc.

Khách và từng tài khoản có cache riêng, không tự chuyển kết quả khách khi đăng nhập.
API `/api/practice` dùng cookie HttpOnly, CSRF và kiểm tra tài khoản, không cần quyền editor.
Server chấm lại đáp án, không tin cờ đúng/sai hay chủ sở hữu do frontend gửi.
RLS chỉ cho đọc/ghi dữ liệu của chính người dùng. Các kết quả chưa gửi giữ trong
hàng đợi thiết bị và thử lại khi reload, có mạng trở lại hoặc bấm đồng bộ.
Giữ kết quả đúng với `needs_retry=false` để bản sai cũ trên thiết bị khác
không làm từ đó xuất hiện lại. Khi có xung đột, timestamp mới hơn được giữ,
không ghép lịch sử; cần đồng hồ thiết bị đúng. Xóa từ/tài khoản xóa dữ liệu liên quan.

## Kiểm tra

`npm test` kiểm tra cấu hình môi trường, bài học, chấm điểm, cache, gửi lại,
đồng bộ giữa các phiên, quyền editor, CRUD, IPA, import XLSX/CSV/TSV, validation và phân trang bằng
Node với API giả lập. Các kiểm thử database dùng PostgreSQL trong bộ nhớ
qua PGlite (chỉ là devDependency), mô phỏng `auth.uid()` và các role Supabase:
kiểm tra migration, chặn ghi cho anon/người học, không tự nâng quyền, quyền
editor, rollback bài đọc/import, giữ định danh từ khi cập nhật, chặn trùng
khác chữ hoa/thường, bảo vệ nhóm còn từ và tính idempotent của backfill.
Không gửi bất kỳ lệnh ghi nào đến Supabase thật trong các kiểm thử này.
Kiểm thử SRS dùng TS-FSRS thật: tính lịch/preview, chuyển bước học/học lại,
lọc từ đến hạn, cache/reload, mất mạng, tách tài khoản và chống phản hồi cũ.
Kiểm thử PostgreSQL xác nhận RLS, RPC, gửi lại, ưu tiên timestamp mới hơn,
rollback toàn batch, chạy lại migration và khóa ngoại, không sửa tiến độ đã thuộc.
Playwright đã kiểm tra SRS ở 1280, 390 và 320 px, chế độ sáng/tối: bốn mức đánh giá,
IPA, phân trang/lọc nhóm, đến hạn theo đồng hồ, reload lịch khách, cookie tài khoản
và gửi lại đánh giá sau lỗi mạng, với API Supabase giả lập.
Kiểm thử luyện gõ xác nhận chuẩn hóa/chấm chính xác, câu điền từ nguyên vẹn,
không đoán biến thể, lưu/reload từ sai, đúng sau sai, tài khoản tách biệt,
mất mạng, gửi lại và kết quả mới hơn. SQL kiểm tra RLS, RPC, rollback,
khóa ngoại và chạy lại migration, không ghi Supabase thật.
Playwright đã kiểm tra luyện gõ ở 1280, 390 và 320 px, chế độ sáng/tối:
ba kiểu luyện, không lộ đáp án trước khi chấm, Enter, xem đáp án, luyện lại,
reload, phân trang từ sai, tách tài khoản và gửi lại kết quả sau lỗi mạng.
Âm thanh dùng speech synthesis giả lập để kiểm tra từ/giọng/tốc độ; cần thử
nghe thực tế trên thiết bị. Browser không đọc cookie hay gọi Supabase trực tiếp.
Kiểm thử API xác nhận `ADMIN_EMAIL`, email đã xác nhận, token sai/giả mạo,
thiếu grant, dữ liệu không hợp lệ, cache riêng tư và việc SDK thực sự chuyển
JWT riêng của từng request đến Auth/database. Browser không được gửi email
tự khai báo để cấp quyền; server không tin `user_metadata` cho quyền quản trị.
Kiểm thử password/OTP xác nhận sai mật khẩu không có phiên, không tự cấp admin,
không cache mật khẩu và endpoint mặc định chỉ sửa tài khoản admin đã xác thực;
không trả về password hoặc chi tiết lỗi upstream. Không thử mật khẩu trên Auth thật.
Kiểm thử cookie dùng SDK Supabase thật với Auth giả lập: HttpOnly/Secure,
thời hạn 30 ngày, chunk phiên dài/Unicode, xóa auth cũ, khôi phục phiên, refresh
access token hết hạn, thu hồi phiên và đăng xuất không làm phiên cũ sống lại.
Kiểm tra CSRF/origin, giả mạo cookie, không trả token, quyền admin và tiến độ
không thể ghi sang tài khoản khác. Không gọi Supabase thật trong các kiểm thử.
Playwright đã kiểm tra desktop 1280px/mobile 390px: JavaScript không đọc được
cookie, không gửi JWT/gọi Supabase trực tiếp, đăng nhập, đồng bộ, reload,
khôi phục từ cookie ở trình duyệt mới, thêm/sửa/xóa nhóm và đăng xuất nhiều tab.

`node --env-file=.env.local scripts/check-connection.cjs` kiểm tra quyền đọc
các bảng nội dung trên project thật, không thay đổi database và không in key.

`node scripts/check-page.mjs` kiểm tra trang Next.js, các asset và chuyển
hướng từ URL HTML cũ, cùng việc API quản trị từ chối request không đăng nhập
qua HTTP khi server ở `http://localhost:3000` đang chạy, cùng các nút thêm/import
và file CSV/XLSX mẫu.
Có thể đặt `TEST_URL` để kiểm tra một server khác. Form import XLSX/CSV/TSV đã
được kiểm tra bằng Playwright ở 1280, 390 và 320 px với API lưu giả lập, không ghi database thật.
Đăng nhập email, RLS trên môi trường Supabase thật và CRUD qua trình duyệt vẫn
cần xác nhận sau khi chạy migration/cấp quyền và deploy.

Thử đăng nhập trên URL HTTPS của Vercel sau khi cấu hình redirect.

Tài liệu: [Next.js](https://nextjs.org/docs/app/getting-started/installation),
[biến môi trường Next.js](https://nextjs.org/docs/app/guides/environment-variables),
[biến môi trường Vercel](https://vercel.com/docs/environment-variables),
[JavaScript SDK](https://supabase.com/docs/reference/javascript/installing),
[API keys](https://supabase.com/docs/guides/api/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Database functions](https://supabase.com/docs/guides/database/functions),
[getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
