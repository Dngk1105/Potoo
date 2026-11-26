# Gói 1: Thiết kế chung, repo, hạ tầng và CI/CD

Mã checklist: `K0-01` đến `K1-07`, `K6-01` đến `K6-06`. Người phụ trách: Dũng.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Thiết kế liên quan | [`../../design/environments.md`](../../design/environments.md) |

## Việc

1. Viết thiết kế chung vào `docs/` (thay tab "Thiết kế chung" trên Google Docs).
2. Mở repo Next.js, cây thư mục rỗng, 3 nhánh `dev`, `staging`, `main`.
3. Cài ESLint + boundaries, Prettier, Lefthook, Vitest.
4. Dựng GitHub Actions, nối Vercel, tạo project Supabase staging và main, LiveKit Cloud, Google OAuth.
5. Viết `.env.example`, nạp secret lên GitHub và Vercel.

## Sở hữu

| File, thư mục | Ghi chú |
|---|---|
| `docs/architecture.md`, `docs/design/`, `docs/glossary.yaml`, `docs/writing-docs.md` | Gói khác đề xuất sửa qua PR |
| `.github/`, `lefthook.yml`, `eslint.config.*`, `.prettierrc*`, `vitest.config.*` | |
| `supabase/config.toml`, `.env.example` | |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | |

## Export qua `index.ts`

Gói này không có code module; không export gì.

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| Cả nhóm chốt thiết kế chung | Cả nhóm | `K0-02` đến `K0-07` |
| Quyền admin GitHub, Vercel, Supabase, LiveKit Cloud, Google Cloud Console | Chủ tài khoản | `K0-12`, `K1-03` đến `K1-07` |
| Bộ test RLS | Gói 2 | Bước test RLS trong CI (`K1-02`) |
| Webhook nhóm chat | Nhóm | Báo CI đỏ |
