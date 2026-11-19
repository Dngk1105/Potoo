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
- Supabase CLI cài qua `devDependencies` của npm, ghim đúng version; máy dev và CI chạy `npx supabase`.
- `supabase/config.toml` đặt `project_id = "potoo"`: container và volume Docker local có tên theo key này, không theo tên thư mục clone.
- Web local mở ở `http://localhost:3000`, không dùng `127.0.0.1`: trình duyệt lưu cookie đăng nhập riêng cho từng host.
- Container `vector` của Supabase local cần Docker daemon mở `tcp://localhost:2375` trên Windows; không mở thì container khởi động lại liên tục, chỉ mất trang Logs của Studio local. Máy nào muốn tắt: đặt `SUPABASE_ANALYTICS_ENABLED=false` trong `supabase/.env.local` (không commit).

- Không có LiveKit hay webcam: đặt adapter mock trong `.env.local`. Database vẫn chạy Supabase local.
- Máy dev không trỏ vào database staging. Dùng chung thì migration đang làm dở của một người làm hỏng database của cả nhóm và lệch lịch sử migration của nhánh `staging`.
- Biến môi trường preview của Vercel chỉ gán cho nhánh `staging`. Nhánh khác không deploy lên cloud.
- Project Supabase free tạm dừng sau 7 ngày không có request. Job GitHub Actions hằng ngày dọn shot hết hạn trên staging và main; job này cũng giữ hai project không bị tạm dừng.
- Thời gian giữ shot đặt bằng `SHOT_RETENTION_HOURS`: local 5, staging và main 24.

## 3. Database local giống nhau trên mọi máy

**Vấn đề:** 5 database local dễ lệch nhau: có người sửa bảng bằng Supabase Studio, có người chưa chạy migration mới, mỗi máy có dữ liệu khác nhau.

**Cách xử lý:**

1. Schema chỉ đổi qua file trong `supabase/migrations/`. Không sửa bảng bằng Supabase Studio.
2. `supabase/seed.sql` chứa dữ liệu mẫu chung: 4 user, bạn bè, room, strip, asset có sẵn.
3. Pull `dev` xong thì chạy `supabase db reset`: dựng lại schema và nạp seed.
4. Lỡ sửa bảng bằng Supabase Studio: chạy `supabase db diff -f <tên>` để chuyển thay đổi thành file migration.
5. CI chạy `supabase db diff --remote` với project staging; có khác biệt nghĩa là có người sửa tay trên staging, CI báo đỏ.
6. Cần dữ liệu giống staging: `supabase db dump --data-only` từ staging rồi nạp vào local. Không ghi gì lên staging.

## 4. CI/CD

**Vấn đề:** lỗi lint, type, quyền phát hiện muộn thì khó tìm ai gây ra. Migration chạy tay lên cloud dễ quên hoặc chạy sai project.

**Cách xử lý:** kiểm tra ở máy trước khi push, rồi GitHub Actions kiểm tra lại và tự chạy migration.

| Khi | Ở đâu | Chạy gì |
|---|---|---|
| Trước khi commit | Máy dev, Lefthook | Prettier format file đã stage |
| Trước khi push | Máy dev, Lefthook | lint, typecheck, format, test |
| PR vào `dev` | GitHub Actions | lint, typecheck, Vitest, test RLS trên Supabase chạy trong runner |
| Merge vào `staging` | GitHub Actions, Vercel | Chạy migration lên project staging; Vercel deploy preview |
| Merge vào `main` | GitHub Actions, Vercel | Chạy migration lên project main; Vercel deploy production |
| Một job đỏ | GitHub Actions | Báo vào nhóm chat |

Migration và deploy chạy song song, nên mỗi migration phải tương thích với code cũ: đổi tên cột thì thêm cột mới, copy
dữ liệu, sửa code, rồi mới drop cột cũ ở migration sau.

## 5. Biến môi trường và secret

**Vấn đề:** biến có prefix `NEXT_PUBLIC_` được đóng gói vào JavaScript gửi cho trình duyệt. Secret đặt nhầm prefix là lộ cho mọi người dùng.

**Cách xử lý:**

- `.env.example` liệt kê đủ tên biến, không có giá trị. File `.env.local` không commit.
- Chỉ URL và key public của Supabase được có prefix `NEXT_PUBLIC_`. Key secret của Supabase và `LIVEKIT_API_SECRET` chỉ dùng trong Route Handler.
- Secret của staging và main lưu trong GitHub Actions secrets và Vercel, tách theo môi trường.
- Google OAuth: mỗi môi trường khai báo redirect URL riêng trong Google Cloud Console và Supabase Auth.
