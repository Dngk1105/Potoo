# Potoo (Phô tô bút)

Photobooth online cho nhóm bạn: tạo room, video call, countdown chụp cùng lúc, ghép shot vào frame thành strip, chỉnh
strip chung, lưu và chia sẻ trong gallery. Một bản web chạy trên điện thoại và laptop.

## Cần cài

| Công cụ | Version | Kiểm tra |
|---|---|---|
| Node.js | 24 LTS (ghi trong `.nvmrc`) | `node -v` ra `v24.x` |
| npm | Đi kèm Node 24 | `npm -v` |
| Git | Bản mới | `git --version` |

Máy đang có Node khác 24: cài [fnm](https://github.com/Schniz/fnm) hoặc [nvm-windows](https://github.com/coreybutler/nvm-windows),
rồi chạy `fnm use` (hoặc `nvm use 24`) trong thư mục repo.

Chạy database và video call trên máy thì cần thêm [Docker Desktop](https://www.docker.com/products/docker-desktop/), xem mục
"Supabase và LiveKit local".

## Chạy lần đầu

1. Clone repo. Nhánh mặc định là `dev`:

   ```powershell
   git clone https://github.com/Dngk1105/Potoo.git
   ```

2. Vào thư mục và cài package đúng theo `package-lock.json`:

   ```powershell
   cd Potoo
   npm ci
   ```

3. Chạy web:

   ```powershell
   npm run dev
   ```

4. Mở `http://localhost:3000`. Trang trắng là đúng: app chưa có màn nào.

## Supabase và LiveKit local

1. Mở Docker Desktop, chờ "Engine running".
2. Chạy Supabase local. Lần đầu tải image mất 5–15 phút:

   ```powershell
   npx supabase start
   ```

3. Chạy LiveKit local:

   ```powershell
   npm run livekit
   ```

4. Copy `.env.example` thành `.env.local` ở gốc repo. Mọi biến local nằm trong file này; Next.js và Supabase CLI
   cùng đọc nó. Điền:
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` lấy từ
     `npx supabase status` (dòng `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`).
   - LiveKit: `NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`.
   - `SHOT_RETENTION_HOURS=5`.
   - Google: xin Dũng Client ID và secret của OAuth client `potoo-dev` (gửi riêng, không dán vào nhóm chat), điền
     `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, rồi chạy `npx supabase stop` và
     `npx supabase start`.
5. Xong việc: `npx supabase stop` và `npm run livekit:stop` để trả RAM. Dữ liệu local vẫn giữ.

Trên Windows, container `supabase_vector_potoo` khởi động lại liên tục là bình thường. Muốn tắt: thêm
`SUPABASE_ANALYTICS_ENABLED=false` vào `.env.local`.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy web ở `localhost:3000` |
| `npm run build` | Build production |
| `npm run lint` | ESLint, gồm luật ranh giới thư mục |
| `npm run typecheck` | Sinh type của Next rồi chạy `tsc` |
| `npm run format` | Format code bằng Prettier |
| `npm run format:check` | Kiểm tra format, không sửa file |
| `npm test` | Chạy test Vitest |

Lefthook tự cài git hook khi chạy `npm ci`; không có thì chạy `npx lefthook install`.

| Hook | Chạy |
|---|---|
| Trước khi commit | Prettier format file đã stage |
| Trước khi push | `lint`, `typecheck`, `format:check`, `test`; một lệnh lỗi thì push bị chặn |

## Làm việc

1. Rẽ nhánh từ `dev`: `git switch -c feat/<tên-việc>`.
2. Commit theo dạng `feat(room): ...`, `fix(studio): ...`.
3. Trước khi merge vào `dev`: `git pull --rebase origin dev`.
4. Không push thẳng `staging`, `main`; không `push --force`.
5. Bật báo CI đỏ một lần: github.com → Settings → Notifications → Actions, tick Email và "Only notify for failed
   workflows". GitHub báo cho người push hoặc mở PR; thấy run đỏ trên `staging`, `main` thì nhắn vào nhóm.

## Đọc gì

| Cần | Đọc |
|---|---|
| Luật cho người và agent | [`AGENTS.md`](AGENTS.md) |
| Toàn cảnh kiến trúc, gặp vấn đề thì đọc file nào | [`docs/architecture.md`](docs/architecture.md) |
| Gói việc, người phụ trách, tiến độ | [`docs/modules/README.md`](docs/modules/README.md) |
| Nhánh, môi trường, CI/CD | [`docs/design/environments.md`](docs/design/environments.md) |
