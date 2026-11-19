# Kiến trúc tổng thể

Web photobooth cho nhóm: host tạo room, member vào bằng link, QR hoặc PIN. Cả room video call qua LiveKit, chụp cùng
countdown, ghép shot vào frame thành strip, chỉnh strip trong studio, lưu và chia sẻ trong gallery. Một bản code chạy
trên điện thoại và laptop.

## Tech stack

| Lớp | Dùng | Việc |
|---|---|---|
| Web + API | Next.js App Router, TypeScript | Routing, Route Handler cho API đặc quyền |
| Giao diện | Tailwind 4; thư viện component do Gói 5 chọn | Component, responsive |
| State | Zustand (client), TanStack Query (server) | |
| Backend | Supabase: Auth, Postgres, Storage, Realtime | Đăng nhập Email và Google, RLS, lưu ảnh, chỉnh chung live |
| Video call | LiveKit Cloud; local dùng `livekit-server --dev` | Video booth |
| Camera | MediaPipe, WebGL | Tách nền, filter, phụ kiện |
| Chỉnh ảnh | Fabric.js | Studio |
| Chất lượng | ESLint + `eslint-plugin-boundaries`, Prettier, Lefthook, Vitest, GitHub Actions | |

### Version

| Thành phần | Version | Ràng buộc |
|---|---|---|
| Node | 24 LTS (`.nvmrc`, `engines.node`) | Vercel hỗ trợ 22, 24, 26 |
| Package manager | npm (đi kèm Node 24) | Chỉ commit `package-lock.json` |
| Next.js | 16.4.6, React 19.3 | `middleware.ts` đổi tên thành `proxy.ts` từ Next 16 |
| TypeScript | 6.0.x | `typescript-eslint` chỉ hỗ trợ TypeScript dưới 6.1. Chưa lên TypeScript 7 |
| ESLint | 9.x | `eslint-plugin-react`, `jsx-a11y`, `import` trong `eslint-config-next` chưa hỗ trợ ESLint 10 |
| Tailwind | 4.3 | |
| Supabase CLI | 3.2.0 (`devDependencies`) | Lệnh ghi lên cloud phải có `--remote`; thiếu thì chạy vào database local. Trong CI thêm `--yes` |

`npm run typecheck` chạy `next typegen` trước `tsc`: type như `LayoutProps` do Next sinh ra, thiếu thì `tsc` báo lỗi.

## Thư mục

| Thư mục | Chứa gì | Được import |
|---|---|---|
| `app/` | Chỉ routing và Route Handler | `core/`, `modules/` qua `index.ts` |
| `core/contracts/` | Port, plugin interface, FrameManifest, message realtime | Không import gì trong repo |
| `core/adapters/` | `index.ts` chọn adapter của từng port bằng `.env`; `mock/`, `real/` chứa adapter | `core/contracts/`, `core/db/`, `core/config/` |
| `core/ui/` | Token, component dùng chung | `core/contracts/` |
| `core/auth/` | Hàm `can()` | `core/contracts/` |
| `core/config/` | Cấu hình, feature flag | `core/contracts/` |
| `core/db/` | Supabase client, type sinh từ DB | `core/contracts/` |
| `modules/<tên>/` | Một khu chức năng, một người phụ trách | `core/`; module khác chỉ qua `index.ts` của nó |
| `supabase/` | Migration, seed, `config.toml` | |

| Module | Khu chức năng |
|---|---|
| `modules/room/` | Tạo room, vào bằng link/QR/PIN, lobby, lệnh của host |
| `modules/booth/` | Video call, effect realtime, countdown, chụp shot |
| `modules/studio/` | Chỉnh strip: chỉnh riêng, chỉnh chung live |
| `modules/gallery/` | Thư viện strip của user, upload asset |
| `modules/social/` | Bạn bè, reaction, comment, chia sẻ link |

- Mỗi module và mỗi thư mục trong `core/` export ra ngoài qua `index.ts`. `eslint-plugin-boundaries` chặn import sâu vào thư mục khác, và chặn import không có trong cột "Được import". Luật nằm trong `eslint.config.mjs`; đổi bảng này thì đổi luật cùng commit.
- Prettier format code (`npm run format`). File `.md`, `.yaml` không qua Prettier: Prettier dàn lại bảng làm lệch cột chữ tiếng Việt.
- LiveKit, webcam, Auth, Storage: gọi qua port. Đọc ghi bảng: hàm truy vấn trong module, dùng client của `core/db/`.

## Kiểm tra quyền ở 3 lớp

| Lớp | Cách chặn |
|---|---|
| Database | RLS gọi hàm SQL dùng chung (ví dụ `can_view_strip()`) |
| Server và booth | Route Handler kiểm tra quyền trước khi ghi; token LiveKit mang role |
| Giao diện | Hàm `can()` ẩn hoặc hiện nút; chỉ để hiển thị, không thay hai lớp trên |

Bảng luật trong `can()` viết song song với hàm SQL. Đổi luật quyền thì chạy lại test RLS.

## Gặp vấn đề thì đọc file nào

Mỗi file tự đứng được; chỉ mở file khớp với vấn đề.

| Gặp vấn đề | Đọc |
|---|---|
| Nhánh `dev`/`staging`/`main`, môi trường local/staging/main, CI/CD, deploy, migration lên cloud, biến môi trường, secret | [design/environments.md](design/environments.md) |
| Member vào sau thấy sai state, host mất mạng, kick, chuyển host, `START_SHOT`, countdown lệch, chọn LiveKit hay Supabase Realtime, giới hạn gói free của realtime | [design/realtime.md](design/realtime.md) |
| Ai được làm gì, host và member, visibility của strip, link chia sẻ, ba lớp kiểm tra quyền, test RLS | [design/permissions.md](design/permissions.md) |
| Bảng, cột, kiểu dữ liệu, asset do user upload, LUT, đường dẫn Storage, dọn shot, Storage sắp đầy, viết hoặc đổi migration | [design/database.md](design/database.md) |
| Cái gì đi qua port, viết adapter mock hoặc real, chọn adapter bằng `.env`, viết effect hoặc công cụ studio, FrameManifest, sửa `core/contracts/` | [design/contracts.md](design/contracts.md) |
| Việc và tiến độ của từng gói | [modules/](modules/) |
| Thuật ngữ | [glossary.yaml](glossary.yaml) |
| Viết hoặc sửa docs | [writing-docs.md](writing-docs.md) |
