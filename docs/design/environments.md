# Nhánh, môi trường và CI/CD

## 1. Ba nhánh

**Vấn đề:** 5 người code song song. Bản dùng để bảo vệ phải luôn chạy được, trong khi code mới vào liên tục.

**Cách xử lý:** code đi một chiều `dev` → `staging` → `main`.

| Nhánh | Việc | Nhận code từ | Luật |
|---|---|---|---|
| `feat/*` | Một tính năng | Rẽ từ `dev` | `git pull --rebase` từ `dev` trước khi merge |
| `dev` | Nhánh mặc định, tích hợp code chạy local | `feat/*` | Không `push --force` |
| `staging` | Chạy trên cloud thật | PR từ `dev`, CI xanh | Cấm push thẳng. Vá lỗi trên `staging` xong thì merge ngược về `dev` |
| `main` | Production, dùng để bảo vệ | PR từ `staging`, cả nhóm nghiệm thu | Cấm push thẳng |

Sửa `core/contracts/` thì báo nhóm trước khi merge.

## 2. Ba môi trường

**Vấn đề:** gói free của Supabase cho 2 project đang chạy. Dev mà dùng chung database cloud thì một người chạy
migration lỗi là cả nhóm hỏng.

**Cách xử lý:** dev chạy toàn bộ trên máy; cloud chỉ có staging và main.

| Môi trường | Nhánh | Supabase | LiveKit | Web |
|---|---|---|---|---|
| local | `dev`, `feat/*` | Docker, `supabase start` | `livekit-server --dev`, hoặc mock | `next dev` |
| staging | `staging` | Project `potoo-staging` | LiveKit Cloud | Vercel preview |
| main | `main` | Project `potoo-main` | LiveKit Cloud | Vercel production |

- Hai project Supabase đặt ở region Singapore (`ap-southeast-1`), gói Free.
- LiveKit Cloud có 2 project `potoo-staging`, `potoo-main`, gói Build, key riêng từng project. Gói Build không chọn được region.
- LiveKit local: `npm run livekit` chạy image Docker `livekit/livekit-server` ở chế độ `--dev`, URL `ws://localhost:7880`, key `devkey` / secret `secret` (key mẫu công khai, chỉ dùng local). Tắt bằng `npm run livekit:stop`.
- Supabase CLI cài qua `devDependencies` của npm, ghim đúng version; máy dev và CI chạy `npx supabase`.
- `supabase/config.toml` đặt `project_id = "potoo"`: container và volume Docker local có tên theo key này, không theo tên thư mục clone.
- Web local mở ở `http://localhost:3000`, không dùng `127.0.0.1`: trình duyệt lưu cookie đăng nhập riêng cho từng host.
- Container `vector` của Supabase local cần Docker daemon mở `tcp://localhost:2375` trên Windows; không mở thì container khởi động lại liên tục, chỉ mất trang Logs của Studio local. Máy nào muốn tắt: đặt `SUPABASE_ANALYTICS_ENABLED=false` trong `.env.local`.

- Không có LiveKit hay webcam: đặt adapter mock trong `.env.local`. Database vẫn chạy Supabase local.
- Máy dev không trỏ vào database staging. Dùng chung thì migration đang làm dở của một người làm hỏng database của cả nhóm và lệch lịch sử migration của nhánh `staging`.
- Biến môi trường preview của Vercel chỉ gán cho nhánh `staging`. Nhánh khác không deploy lên cloud.
- Vercel project `potoo` (gói Hobby): production `https://potoo-app.vercel.app` (nhánh `main`), staging `https://potoo-staging.vercel.app` (nhánh `staging`). `vercel.json` tắt deploy mọi nhánh trừ `main`, `staging`. Staging tắt Vercel Authentication: ai có link cũng mở được.
- Project Supabase free tạm dừng sau 7 ngày không có request. Job GitHub Actions hằng ngày dọn shot hết hạn trên staging và main; job này cũng giữ hai project không bị tạm dừng.
- Thời gian giữ shot đặt bằng `SHOT_RETENTION_HOURS`: local 5, staging và main 24.

## 3. Database local giống nhau trên mọi máy

**Vấn đề:** 5 database local dễ lệch nhau: có người sửa bảng bằng Supabase Studio, có người chưa chạy migration mới, mỗi máy có dữ liệu khác nhau.

**Cách xử lý:**

1. Schema chỉ đổi qua file trong `supabase/migrations/`. Không sửa bảng bằng Supabase Studio.
2. `supabase/seed.sql` chứa dữ liệu mẫu chung: 4 user, bạn bè, room, strip, asset có sẵn.
3. Pull `dev` xong thì chạy `supabase db reset`: dựng lại schema và nạp seed.
4. Lỡ sửa bảng bằng Supabase Studio: chạy `supabase db diff -f <tên>` để chuyển thay đổi thành file migration.
5. Workflow migration chạy `supabase db diff --remote` ngay sau `db push` trên staging và main; có khác biệt nghĩa là có người sửa tay trên cloud, workflow báo đỏ. Không chạy ở PR: PR không đọc được secret của GitHub environment `staging`.
6. Cần dữ liệu giống staging: `supabase db dump --data-only` từ staging rồi nạp vào local. Không ghi gì lên staging.

Lệnh local:

| Lệnh | Việc |
|---|---|
| `npm run db:start` | Bật Supabase local |
| `npm run db:reset` | Dựng lại schema từ `supabase/migrations/`, nạp seed. Xoá hết dữ liệu local |
| `npm run db:new -- <tên>` | Tạo file migration có timestamp hiện tại |
| `npm run db:check` | Kiểm migration so với `origin/dev` |

**Tránh xung đột version migration:**

1. Tạo migration bằng `npm run db:new -- <tên>`, không tự đặt tên file.
2. Trước khi push: `git fetch origin dev`, rồi rebase hoặc merge `dev` vào nhánh của mình.
3. Migration của mình phải có timestamp mới hơn mọi migration trên `dev`. Cũ hơn thì `db push` lên staging từ chối. Sửa: tạo file mới bằng `npm run db:new`, chuyển SQL sang, xoá file cũ.
4. Không sửa, không xoá migration đã có trên `dev`.
5. `npm run db:check` kiểm 3 luật trên. Lefthook chạy lệnh này ở pre-push khi có file migration; CI chạy ở mọi PR.

## 4. CI/CD

**Vấn đề:** lỗi lint, type, quyền phát hiện muộn thì khó tìm ai gây ra. Migration chạy tay lên cloud dễ quên hoặc chạy sai project.

**Cách xử lý:** kiểm tra ở máy trước khi push, rồi GitHub Actions kiểm tra lại và tự chạy migration.

| Khi | Ở đâu | Chạy gì |
|---|---|---|
| Trước khi commit | Máy dev, Lefthook | Prettier format file đã stage |
| Trước khi push | Máy dev, Lefthook | lint, typecheck, format, test; `db:check` khi có file migration |
| PR vào `dev` | GitHub Actions | lint, typecheck, Vitest; `db:check`, `supabase db reset` và test RLS trên Supabase chạy trong runner |
| Push thẳng lên `dev` | GitHub Actions | Như PR vào `dev`; `db:check` so với commit trước lần push |
| Merge vào `staging` | GitHub Actions, Vercel | Chạy migration lên project staging, kiểm drift; Vercel deploy preview |
| Merge vào `main` | GitHub Actions, Vercel | Chạy migration lên project main, kiểm drift; Vercel deploy production |
| Một job đỏ | GitHub | Email và GitHub Mobile cho người push hoặc mở PR; job theo lịch báo cho người sửa `cron` gần nhất |

Nhóm chat là Zalo hoặc Messenger; hai app này không có webhook cho nhóm, nên không gửi báo tự động vào nhóm. Mỗi
người bật GitHub → Settings → Notifications → Actions, chọn "Only notify for failed workflows". Thấy run đỏ trên
`staging` hoặc `main` thì nhắn vào nhóm.

Sau mỗi lần deploy, mở `/api/health` của môi trường đó (`https://potoo-staging.vercel.app/api/health`,
`https://potoo-app.vercel.app/api/health`). Trang gọi thử Supabase và LiveKit bằng biến của chính môi trường, trả `ok`
hoặc lý do lỗi cho từng biến (`missing`, `wrong-environment`, `rejected`, `unreachable`), không trả giá trị. Sửa biến
trên Vercel xong phải Redeploy mới có tác dụng.

Migration và deploy chạy song song, nên mỗi migration phải tương thích với code cũ: đổi tên cột thì thêm cột mới, copy
dữ liệu, sửa code, rồi mới drop cột cũ ở migration sau.

## 5. Biến môi trường và secret

**Vấn đề:** biến có prefix `NEXT_PUBLIC_` được đóng gói vào JavaScript gửi cho trình duyệt. Secret đặt nhầm prefix là lộ cho mọi người dùng.

**Cách xử lý:**

- `.env.example` liệt kê đủ tên biến, không có giá trị. Mỗi máy dev có một file `.env.local` ở gốc repo chứa mọi biến local; Next.js và Supabase CLI cùng đọc file này. File `.env.local` không commit.

| Biến | Phía | Ghi chú |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Trình duyệt, server | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Trình duyệt, server | Key `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Server | Key `sb_secret_...`, bỏ qua RLS |
| `NEXT_PUBLIC_LIVEKIT_URL` | Trình duyệt | URL `wss://` của project LiveKit |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Server | Route Handler ký token vào room |
| `START_SHOT_SIGNING_KEY` | Server | 32 byte ngẫu nhiên mã hoá base64url; key riêng cho từng môi trường, Route Handler ký HMAC event |
| `START_SHOT_ED25519_PRIVATE_KEY` | Server | Ed25519 PKCS#8 DER mã hoá base64url; key riêng cho từng môi trường, Route Handler ký event |
| `REALTIME_ADAPTER` | Server | `real` hoặc `mock` cho `RoomPort` và `RoomBus`. Bỏ qua để dùng `real` |
| `MEDIA_ADAPTER` | Server | `real` hoặc `mock` cho `MediaSource`. Bỏ qua để dùng `real` |
| `SHOT_RETENTION_HOURS` | Server, job dọn shot | |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | Supabase CLI, chỉ local | Client `potoo-dev`. Staging, main điền trong Supabase Auth |
| `SUPABASE_ANALYTICS_ENABLED` | Supabase CLI, chỉ local | `false` để bỏ container `vector`, `analytics` |

- Chỉ URL và key public của Supabase được có prefix `NEXT_PUBLIC_`. Key secret của Supabase và `LIVEKIT_API_SECRET` chỉ dùng trong Route Handler.
- Server kiểm tra hai biến chọn adapter rồi truyền cấu hình đã kiểm tra sang client. Khởi động lại dev server sau khi đổi
  `.env.local`. Trên Vercel, deploy lại sau khi đổi cấu hình môi trường.
- Secret của staging và main lưu trong GitHub Actions secrets và Vercel, tách theo môi trường. `START_SHOT_SIGNING_KEY` và `START_SHOT_ED25519_PRIVATE_KEY` cần được cấu hình riêng trước khi bật luồng ký event; chưa coi các key này đã được cấp.
- GitHub: 2 environment `staging`, `main`, mỗi environment chỉ cho nhánh cùng tên dùng. Secret `SUPABASE_DB_URL` là connection string Session pooler của project tương ứng (runner GitHub không có IPv6). Không dùng `SUPABASE_ACCESS_TOKEN`: token này có quyền trên mọi project của tài khoản.
- Vercel: 7 biến trong bảng dưới gán cho Production (giá trị main) và Preview nhánh `staging` (giá trị staging). Secret bật Sensitive.
- Google OAuth: mỗi môi trường khai báo redirect URL riêng trong Google Cloud Console và Supabase Auth.

| Môi trường | OAuth client (Google Cloud project `potoo`) | Redirect URL trong Google | Client ID, secret nằm ở |
|---|---|---|---|
| local | `potoo-dev` | `http://127.0.0.1:54321/auth/v1/callback` | `.env.local` của từng máy (không commit) |
| staging | `potoo-dev` | `https://<ref staging>.supabase.co/auth/v1/callback` | Supabase Auth của `potoo-staging` |
| main | `potoo-main` | `https://<ref main>.supabase.co/auth/v1/callback` | Supabase Auth của `potoo-main` |

- Máy dev chỉ giữ secret của `potoo-dev`. Secret của `potoo-main` chỉ nằm trong Supabase main.
- OAuth consent screen tên `Potoo`, scope `openid`, `email`, `profile`. Trạng thái In production: mọi tài khoản Google đăng nhập được. Home page `https://potoo-app.vercel.app`, privacy policy `https://potoo-app.vercel.app/privacy` (`app/privacy/page.tsx`), authorized domain `potoo-app.vercel.app` và 2 domain `<ref>.supabase.co`. Không đặt logo: có logo thì Google bắt duyệt thủ công.
