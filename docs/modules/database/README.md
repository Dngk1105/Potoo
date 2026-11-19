# Gói 2: Database và phân quyền

Người phụ trách: chưa có. Mã checklist: `K2-01` đến `K2-06`.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Thiết kế liên quan | `docs/design/database.md`, `docs/design/permissions.md`, `docs/design/environments.md` (mục 3) |

## Việc

1. Viết migration 11 bảng theo `docs/design/database.md`.
2. Viết hàm SQL dùng chung (`can_view_strip()`, `is_room_host()`...) và trigger tạo `profiles` khi đăng ký.
3. Bật RLS trên mọi bảng; policy chỉ gọi hàm SQL dùng chung.
4. Viết policy cho Storage: bucket private, đọc ảnh bằng signed URL.
5. Viết `seed.sql`: 4 user mẫu, bạn bè, room, strip, asset có sẵn của hệ thống.
6. Viết test RLS với 4 user mẫu; sinh type TypeScript từ DB vào `core/db/`.

## Ràng buộc đã chốt

| Ràng buộc | Nguồn |
|---|---|
| `uuid` cho mọi `id`; mọi bảng có `created_at`; `text` + `check` thay enum; khoá ngoại ghi rõ `on delete` | `database.md` mục 2 |
| Visibility theo từng owner trong `strip_owners`; viewer xem được khi mọi owner cho phép | `permissions.md` mục 2 |
| RLS xử lý `link` như `friends`; người có link mở strip qua Route Handler và `share_token` | `permissions.md` mục 2 |
| Không có vai trò hệ thống; host lấy từ `rooms.host_id`, `room_members` không có cột role | `permissions.md` mục 1 |
| Xoá asset là đặt `deleted_at` | `database.md` mục 3 |
| Migration đã push không sửa; đổi cột theo hai bước | `database.md` mục 6 |
| Schema chỉ đổi qua file migration, không sửa bằng Supabase Studio | `environments.md` mục 3 |

## Sở hữu

| File, thư mục | Ghi chú |
|---|---|
| `supabase/migrations/` | |
| `supabase/seed.sql` | Cả nhóm dùng chung; `supabase db reset` nạp lại |
| `tests/rls/` | CI chạy ở mọi PR vào `dev` |
| `core/db/` | Supabase client, type sinh từ DB |

## Export qua `index.ts`

| Tên | Loại (component, hook, hàm) | Dùng bởi |
|---|---|---|
| `Database` | Type sinh từ DB | Mọi module, Gói 4 |
| | | |

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| `supabase/config.toml`, CI chạy `supabase start` | Gói 1 | Chạy test RLS trong CI |
| Bảng luật `can()` | Gói 4 | Đối chiếu với hàm SQL, hai bên phải khớp |
