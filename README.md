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

Supabase local (Docker) và LiveKit chưa cần ở bước này; hướng dẫn thêm khi xong Gói 1.

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

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy web ở `localhost:3000` |
| `npm run build` | Build production |
| `npm run lint` | ESLint, gồm luật ranh giới thư mục |
| `npm run typecheck` | Sinh type của Next rồi chạy `tsc` |
| `npm run format` | Format code bằng Prettier |
| `npm run format:check` | Kiểm tra format, không sửa file |

Trước khi push: `npm run lint`, `npm run typecheck` và `npm run format:check` phải qua.

## Làm việc

1. Rẽ nhánh từ `dev`: `git switch -c feat/<tên-việc>`.
2. Commit theo dạng `feat(room): ...`, `fix(studio): ...`.
3. Trước khi merge vào `dev`: `git pull --rebase origin dev`.
4. Không push thẳng `staging`, `main`; không `push --force`.

## Đọc gì

| Cần | Đọc |
|---|---|
| Luật cho người và agent | [`AGENTS.md`](AGENTS.md) |
| Toàn cảnh kiến trúc, gặp vấn đề thì đọc file nào | [`docs/architecture.md`](docs/architecture.md) |
| Gói việc, người phụ trách, tiến độ | [`docs/modules/README.md`](docs/modules/README.md) |
| Nhánh, môi trường, CI/CD | [`docs/design/environments.md`](docs/design/environments.md) |
