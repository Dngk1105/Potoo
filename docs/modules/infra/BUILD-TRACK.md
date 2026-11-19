# BUILD-TRACK: Gói 1

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## Bước 1: Thiết kế chung

| Mã | Việc | Trạng thái | Ghi vào | Ghi chú |
|---|---|---|---|---|
| K0-01 | Tech stack, thư mục | [~] | `docs/architecture.md` | |
| K0-02 | Vai trò, visibility | [~] | `docs/design/permissions.md` | Chỉ có user; visibility theo từng owner. Sửa sheet theo |
| K0-03 | Bảng quyền thao tác | [~] | `docs/design/permissions.md` | |
| K0-04 | Schema database | [~] | `docs/design/database.md` | 11 bảng: thêm `assets`, không có `blocks`. Sửa sheet theo |
| K0-05 | Port, plugin interface | [~] | `docs/design/contracts.md` | Mock chỉ còn 3 (`RoomPort`, `RoomBus`, `MediaSource`); Gói 3 nhẹ hơn. Sửa sheet K3-02, K3-04 |
| K0-06 | Message realtime, kênh RoomBus | [~] | `docs/design/realtime.md` | Chốt phương án lai. Bỏ `ROOM_STATE`, `KICKED`; thêm `ROOM_CHANGED`. Sửa sheet theo |
| K0-07 | FrameManifest, đường dẫn Storage | [~] | `docs/design/contracts.md`, `docs/design/database.md` | |
| K0-08 | Luật nhánh Git | [~] | `docs/design/environments.md` | Sheet ghi `CONTRIBUTING.md`; dùng file thiết kế thay |

## Bước 2: Mở repo

| Mã | Việc | Trạng thái | Ghi chú |
|---|---|---|---|
| K0-09 | Khởi tạo Next.js + TypeScript | [~] | Node 24, npm, Next 16.4.6, TypeScript 6.0, ESLint 9. Build, lint, typecheck qua trên máy Dũng. Chưa commit |
| K0-10 | Cây thư mục `app/`, `core/`, `modules/`, `supabase/` | [ ] | |
| K0-11 | ESLint, Prettier, boundaries | [ ] | ESLint 9 dùng `eslint.config.mjs`, không dùng `.eslintrc.json` |
| K0-12 | 3 nhánh, branch protection | [ ] | |
| K0-13 | Push khung, cả nhóm clone chạy được | [ ] | |

## Gói 1: Hạ tầng và CI/CD

| Mã | Việc | Trạng thái | Ghi chú |
|---|---|---|---|
| K1-01 | Lefthook | [ ] | |
| K1-02 | GitHub Actions CI | [ ] | Thêm test RLS (cần `supabase start` trong runner) |
| K1-03 | Vercel | [ ] | Biến preview chỉ gán nhánh `staging` |
| K1-04 | Supabase staging và main | [ ] | Sheet ghi "dev và staging": đã đổi theo `environments.md` |
| K1-05 | LiveKit Cloud | [ ] | |
| K1-06 | Migration tự động | [ ] | Sheet ghi "tự migrate lên dev": đổi thành staging và main |
| K1-07 | Secret, `.env.example` | [ ] | |

Việc thiếu so với sheet: Google OAuth, webhook báo nhóm chat, job giữ project Supabase không bị tạm dừng.
