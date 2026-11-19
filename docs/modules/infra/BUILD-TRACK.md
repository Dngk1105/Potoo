# BUILD-TRACK: `infra` (Gói 1)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

### Bước 1: Thiết kế chung

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K0-01 | Tech stack, thư mục | [~] | `docs/architecture.md` | Chờ nhóm review |
| K0-02 | Vai trò, visibility | [~] | `docs/design/permissions.md` | Chỉ có user; visibility theo từng owner |
| K0-03 | Bảng quyền thao tác | [~] | `docs/design/permissions.md` | |
| K0-04 | Schema database | [~] | `docs/design/database.md` | 11 bảng: thêm `assets`, không có `blocks` |
| K0-05 | Port, plugin interface | [~] | `docs/design/contracts.md` | Mock chỉ còn 3 (`RoomPort`, `RoomBus`, `MediaSource`) |
| K0-06 | Message realtime, kênh RoomBus | [~] | `docs/design/realtime.md` | Phương án lai. Bỏ `ROOM_STATE`, `KICKED`; thêm `ROOM_CHANGED` |
| K0-07 | FrameManifest, đường dẫn Storage | [~] | `docs/design/contracts.md`, `docs/design/database.md` | |
| K0-08 | Luật nhánh Git | [~] | `docs/design/environments.md` | Dùng file thiết kế thay `CONTRIBUTING.md` |

### Bước 2: Mở repo

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K0-09 | Khởi tạo Next.js + TypeScript | [~] | `package.json`, `.nvmrc` | Node 24, npm, Next 16.4.6, TypeScript 6.0, ESLint 9 |
| K0-10 | Cây thư mục `app/`, `core/`, `modules/`, `supabase/` | [~] | `docs/architecture.md` | 5 module: room, booth, studio, gallery, social |
| K0-11 | ESLint, Prettier, boundaries | [~] | `eslint.config.mjs`, `.prettierrc.json` | Boundaries theo bảng Thư mục; thử 3 import sai đều bị chặn. Prettier bỏ qua `.md`, `.yaml` |
| K0-12 | 3 nhánh, branch protection | [x] | `github.com/Dngk1105/Potoo` | Nhánh mặc định `dev` (kiểm bằng `git ls-remote --symref`). Ruleset: `main`, `staging` chặn xoá, chặn force push, bắt PR; `dev` chặn xoá, chặn force push (Dũng tạo trên web) |
| K0-13 | Push khung, cả nhóm clone chạy được | [ ] | `README.md` | |

### Gói 1: Hạ tầng và CI/CD

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K1-01 | Lefthook | [ ] | `lefthook.yml` | |
| K1-02 | GitHub Actions CI | [ ] | `.github/workflows/` | Thêm test RLS (cần `supabase start` trong runner) |
| K1-03 | Vercel | [ ] | | Biến preview chỉ gán nhánh `staging` |
| K1-04 | Supabase staging và main | [ ] | `supabase/config.toml` | |
| K1-05 | LiveKit Cloud | [ ] | | |
| K1-06 | Migration tự động | [ ] | `.github/workflows/` | Lên staging và main |
| K1-07 | Secret, `.env.example` | [ ] | `.env.example` | |

Việc thiếu so với sheet: Google OAuth, webhook báo nhóm chat, job dọn shot và giữ project Supabase không bị tạm dừng.

## 2. Cần làm tiếp

1. [ ] Cả nhóm review `docs/architecture.md` và `docs/design/` (K0-01 đến K0-08)
2. [ ] K0-13: viết `README.md` hướng dẫn clone và chạy; cả nhóm clone chạy được

## 3. Nhật ký phiên

### 2026-11-19: K0-11 ESLint boundaries, Prettier

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| `eslint-plugin-boundaries` 7.4: 8 element theo bảng Thư mục, chỉ import qua `index.ts` | [x] |
| Prettier 3.10, `eslint-config-prettier`; script `format`, `format:check` | [x] |

**Kiểm chứng:** file mẫu import sâu `modules/room/internal`, `core/contracts` → `core/db`, `core/ui` → `core/auth`: 3 lỗi `boundaries/dependencies`. Import qua `index.ts` được phép: không lỗi. `npm run lint`, `typecheck`, `build`, `format:check`: qua.

**Cần follow-up:** Lefthook và CI chạy `format:check` (K1-01, K1-02).

### 2026-11-19: Khung docs, repo Next.js, cây thư mục

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Viết `docs/` thay tab "Thiết kế chung" trên Google Docs; chốt vai trò, schema, RoomBus, contracts | [~] chờ review |
| Sửa Google Sheet cho khớp docs (27 dòng) | [x] |
| K0-09: Next.js 16.4.6, TypeScript 6.0, ESLint 9, Node 24, npm | [~] |
| K0-10: cây thư mục `core/`, `modules/`, `supabase/` | [~] |
| Khung `docs/modules/_template/` và bảng `docs/modules/README.md` | [x] |

**Kiểm chứng:** `npm run lint`, `npm run typecheck`, `npm run build`: qua.

**Cần follow-up:** chưa có remote GitHub nên chưa push.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | Review docs thiết kế chung | Cả nhóm |
| 2026-11-19 | Quyền admin GitHub, Vercel, Supabase, LiveKit Cloud, Google Cloud Console | Chủ tài khoản |
| 2026-11-19 | Gói 2 đến Gói 5 tạo thư mục trong `docs/modules/` từ `_template/` | Người phụ trách từng gói |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
