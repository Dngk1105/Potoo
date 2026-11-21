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
| K0-13 | Push khung, cả nhóm clone chạy được | [~] | `README.md` | Clone mới trên máy Dũng chạy đủ README. Chờ 4 bạn còn lại clone thử |

### Gói 1: Hạ tầng và CI/CD

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K1-01 | Lefthook | [x] | `lefthook.yml`, `vitest.config.mts` | Pre-commit: Prettier file đã stage. Pre-push: lint, typecheck, format, test. Thêm Vitest 5 |
| K1-02 | GitHub Actions CI | [x] | `.github/workflows/ci.yml` | PR vào `dev`, `staging` và push lên `dev`: lint, typecheck, format, test, build. Lần chạy đầu xanh. Chưa có test RLS, `db diff`, báo nhóm chat (mục 4) |
| K1-03 | Vercel | [x] | `vercel.json` | `potoo-app.vercel.app` (`main`), `potoo-staging.vercel.app` (`staging`). Chỉ 2 nhánh này deploy. Biến preview chỉ gán nhánh `staging` |
| K1-04 | Supabase staging và main | [x] | `supabase/config.toml` | `potoo-staging`, `potoo-main`, Singapore. CLI 3.2.0 qua npm. `project_id = "potoo"` |
| K1-05 | LiveKit Cloud | [x] | `package.json` (`npm run livekit`) | 2 project Cloud gói Build; local chạy image Docker 1.13.11 `--dev`. Bỏ prefix tên room |
| K1-06 | Migration tự động | [x] | `.github/workflows/migrate.yml`, `keep-alive.yml` | Push lên `staging`, `main` chạy `db push --remote`. Keep alive hằng ngày 09:00 |
| K1-07 | Secret, `.env.example` | [x] | `.env.example` | 7 biến. GitHub environment `staging`, `main` (`SUPABASE_DB_URL`); Vercel Production và Preview `staging` |

Việc thiếu so với sheet: Google OAuth, báo CI đỏ, giữ project Supabase không bị tạm dừng (đã làm, xem nhật ký 2026-11-20); job dọn shot (chờ bảng `shots` của Gói 2).

## 2. Cần làm tiếp

1. [ ] Cả nhóm review `docs/architecture.md` và `docs/design/` (K0-01 đến K0-08)
2. [ ] K0-13: 4 bạn còn lại clone và chạy theo `README.md`, báo lại kết quả
3. [ ] Publish Google OAuth consent screen (cần trang `/privacy`)

## 3. Nhật ký phiên

### 2026-11-20: Báo CI đỏ

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Nhóm chat là Zalo/Messenger, không có webhook nhóm: dùng email và GitHub Mobile của GitHub cho người push hoặc mở PR (Dũng chốt) | [x] |
| `environments.md` mục 4 sửa dòng "Một job đỏ"; `README.md` thêm bước bật thông báo và mục Supabase, LiveKit local | [x] |

**Kiểm chứng:** `npm run format:check`: qua. Chưa có run đỏ để thử thông báo.

**Cần follow-up:** 4 bạn còn lại bật thông báo Actions trên GitHub.

### 2026-11-20: K1-07, K1-03, K1-06, keep alive

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| GitHub environment `staging`, `main` (chỉ nhánh cùng tên), secret `SUPABASE_DB_URL` (Session pooler) (Dũng làm trên web) | [x] |
| Vercel project `potoo` Hobby: production theo `main`, domain `potoo-app.vercel.app`, `potoo-staging.vercel.app` gán nhánh `staging`; tắt Vercel Authentication; 7 biến cho Production và Preview `staging`, secret bật Sensitive (Dũng làm trên web) | [x] |
| `vercel.json`: `deploymentEnabled` chỉ `main`, `staging` | [x] |
| Supabase Auth: Site URL, Redirect URLs của staging, main theo domain Vercel (Dũng làm trên web) | [x] |
| `.github/workflows/migrate.yml`: push lên `staging`/`main` (đổi `supabase/migrations/**`) chạy `supabase db push --remote="$SUPABASE_DB_URL" --yes` | [x] |
| `.github/workflows/keep-alive.yml`: schedule trên `dev` dispatch lại workflow trên `staging`, `main`; job chạy `select now()` | [x] |
| PR `dev` → `staging` (#1), `staging` → `main` (#2) | [x] |

**Kiểm chứng:** `actionlint` 1.7.7: 0 lỗi; `npx supabase db push --remote=<DB local> --yes --dry-run`: `upToDate`. Push `dev` (`9bec49c`): CI xanh, Vercel không tạo deployment. Merge vào `staging` (`60d9eb3`): Vercel deploy xong, `https://potoo-staging.vercel.app` 200; Migrate run `44702277320` xanh; Keep alive dispatch tay trên `staging` run `44703139166` xanh. Đăng nhập Google qua `/auth/v1/authorize?provider=google&redirect_to=https://potoo-staging.vercel.app/`: quay về staging, user Google có trong Auth của `potoo-staging` (Dũng kiểm). Merge vào `main` (`3881b40`): Vercel deploy xong, `https://potoo-app.vercel.app` 200; Migrate xanh; Keep alive trên `main` run `44707680061` xanh.

**Cần follow-up:** chưa thấy lần chạy theo lịch đầu tiên (09:00 ngày mai). CI chạy `db diff --remote` chưa làm: PR không đọc được environment `staging`, cần chỗ chạy khác. Đăng nhập Google trên production chưa thử.

### 2026-11-20: Google OAuth

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Google Cloud project `potoo`, consent screen `Potoo` (External, Testing, 5 test user), scope `openid`, `email`, `profile`; authorized domain là 2 domain `<ref>.supabase.co` (`supabase.co` là public suffix, Google không nhận) (Dũng làm trên web) | [x] |
| 2 OAuth client: `potoo-dev` (local, staging), `potoo-main` (main) | [x] |
| `supabase/config.toml`: `[auth.external.google]` đọc client từ `supabase/.env.local` | [x] |
| Bật Google trong Supabase Auth của `potoo-staging`, `potoo-main` (Dũng làm trên web) | [x] |
| Publish consent screen | [ ] chờ K1-03 |

**Kiểm chứng:** `GET /auth/v1/authorize?provider=google` trên local, staging, main: cả 3 trả 302 tới `accounts.google.com` với `redirect_uri` đúng callback của từng môi trường; Google trả 302 tới `/v3/signin/identifier` (không có `redirect_uri_mismatch`, `invalid_client`). So hash `client_id`: local và staging giống nhau (`potoo-dev`), main khác. `supabase start` khi chưa có secret vẫn chạy.

**Cần follow-up:** đăng nhập trọn vòng (quay về app) kiểm sau K1-03; Site URL và redirect allowlist của Supabase cloud cần URL Vercel.

### 2026-11-20: K1-05 LiveKit, bắt đầu K1-07

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| LiveKit Cloud: 2 project gói Build, staging `wss://potoo-b619gqn3.livekit.cloud`, main `wss://potoo-main-sr9wj8yb.livekit.cloud` (Dũng tạo trên web) | [x] |
| Local: `npm run livekit` chạy `livekit/livekit-server:v1.13.11 --dev`, label `com.docker.compose.project=potoo`; `npm run livekit:stop` | [x] |
| `.env.example`: tên biến Supabase (key `sb_publishable_`, `sb_secret_`), LiveKit, `SHOT_RETENTION_HOURS`; bảng biến trong `environments.md` mục 5 | [x] |

**Kiểm chứng:** Local: `GET :7880` trả 200; `RoomServiceClient.createRoom` với `devkey` trả 200; 2 tab trình duyệt vào cùng room, publish video canvas, mỗi tab `subscribed video` của tab kia, ICE pair `succeeded`. Cloud: server test ký token bằng key của từng project (secret không in ra): staging và main đều `API OK`; 2 tab mỗi project `connected`, `subscribed video`, ICE pair `succeeded`. File chứa key đã xoá sau test. `npm run format:check`: qua.

**Cần follow-up:** project staging trên LiveKit đang tên `potoo`, đổi thành `potoo-staging`. Nạp key lên GitHub, Vercel (K1-07).

### 2026-11-20: K1-04 Supabase staging và main

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Supabase CLI 3.2.0 trong `devDependencies`, ghim đúng version | [x] |
| `supabase init`: `project_id = "potoo"`, `site_url = "http://localhost:3000"`, redirect `http://localhost:3000/**` | [x] |
| Project `potoo-staging`, `potoo-main`: region Singapore, Data API bật, tự cấp quyền bảng mới (giống local), không bật RLS tự động, không nối GitHub (Dũng tạo trên web) | [x] |
| Docs: `environments.md` (tên project, region, CLI, `project_id`, `localhost`, tắt analytics), `architecture.md` bảng Version; `db diff --linked` đổi thành `--remote` | [x] |

**Kiểm chứng:** `npx supabase --version`: `3.2.0`. `npx supabase start`: 12 container nhóm `potoo` (label `com.docker.compose.project=potoo`), `GET :54321/auth/v1/health` trả 200. Container `vector` khởi động lại liên tục trên Windows (cần daemon `tcp://localhost:2375`); đặt `SUPABASE_ANALYTICS_ENABLED=false` trong `supabase/.env.local` thì không còn `vector`, `analytics`, Auth vẫn 200. `npx supabase projects list`: `potoo-staging` (`xpxvrglutvgmifydzauj`) và `potoo-main` (`ddqpfmknmumdpihaohil`) ở `ap-southeast-1`, `ACTIVE_HEALTHY`, Postgres 17.12 giống local. `GET https://<ref>.supabase.co/auth/v1/health` không có `apikey`: 401 cả hai.

**Cần follow-up:** `supabase/seed.sql` chưa có (`supabase start` báo không tìm thấy file). CI `db diff --remote` làm cùng K1-06.

### 2026-11-19: K1-02 GitHub Actions CI

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| `.github/workflows/ci.yml`: `actions/checkout@v7`, `actions/setup-node@v7` (Node theo `.nvmrc`, cache npm), `npm ci`, lint, typecheck, format, test, build | [x] |
| Chạy xanh trên GitHub | [x] |

**Kiểm chứng:** Prettier đọc được file YAML. Input `node-version-file`, `cache` có trong `action.yml` của `setup-node@v7`. Push `dev` (`2f5eb9a`): hook pre-push qua; run `44559122785` trên GitHub xanh cả 9 bước, chạy 37 giây.

**Cần follow-up:** thêm test RLS, `db diff`, báo nhóm chat khi đủ điều kiện (mục 4).

### 2026-11-19: K1-01 Lefthook, Vitest

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Lefthook 2.2: pre-commit Prettier, pre-push lint/typecheck/format/test chạy song song | [x] |
| Vitest 5.1, alias `@` khớp `tsconfig.json`, script `npm test` | [x] |

**Kiểm chứng:** `lefthook run pre-push --force` trên code có import sai: `typecheck`, `format` báo lỗi, exit 1. Trên code sạch: 4 job qua. `lefthook run pre-commit` với file sai format đã stage: bản stage được format lại. Test mẫu import qua `@/core/config`: qua (đã xoá).

**Cần follow-up:** CI chạy cùng các lệnh này (K1-02).

### 2026-11-19: K0-12 repo GitHub, K0-13 README

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Push `main`, `dev`, `staging` lên `github.com/Dngk1105/Potoo`; nhánh mặc định `dev`; ruleset | [x] |
| `README.md`: cần cài gì, chạy lần đầu, lệnh, cách làm nhánh | [x] |

**Kiểm chứng:** clone mới từ GitHub vào thư mục trống, ra nhánh `dev`. `npm ci`, `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: qua. `npm run dev`: `GET /` trả 200.

**Cần follow-up:** 4 bạn còn lại clone thử.

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
| 2026-11-19 | CI chạy test RLS: cần `supabase/config.toml` và test trong `tests/rls/` | Gói 2 |
| 2026-11-19 | CI chạy `supabase db diff --remote` với project staging: PR không đọc được secret của environment `staging`; đề xuất chạy trong `migrate.yml` trước `db push` | Gói 1, chờ Dũng chốt |
| 2026-11-20 | Đề xuất thêm vào `database.md` mục 2: migration tạo bảng bật RLS ngay cho bảng đó (cloud không bật RLS tự động, giống local) | Gói 2, cả nhóm |
| 2026-11-20 | `supabase/seed.sql` (4 user, bạn bè, room, strip, asset) | Gói 2 |
| 2026-11-20 | Publish Google OAuth consent screen (đang Testing, tối đa 100 test user): cần URL production Vercel làm authorized domain và trang `/privacy` | K1-03, gói phụ trách `app/` |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
