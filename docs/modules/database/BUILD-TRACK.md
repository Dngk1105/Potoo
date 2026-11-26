# BUILD-TRACK: `database` (Gói 2)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K2-01 | Migration 11 bảng | [ ] | `supabase/migrations/` | Dũng. Dùng `supabase migration new` để có timestamp thật |
| K2-02 | Hàm SQL dùng chung | [ ] | `supabase/migrations/` | Dũng |
| K2-03 | RLS trên mọi bảng, policy Storage | [ ] | `supabase/migrations/` | Dũng. Mặc định chặn hết |
| K2-04 | `seed.sql` 4 user mẫu | [ ] | `supabase/seed.sql` | My. Không có vai trò hệ thống, xem mục 4 |
| K2-05 | Test RLS 4 user | [ ] | `tests/rls/` | My |
| K2-06 | Sinh type từ DB | [ ] | `core/db/types.ts` | My |

K2-07 (API cấp token LiveKit) đã chuyển sang Gói 4.

## 2. Cần làm tiếp

1. [ ] K2-01 migration 11 bảng (Dũng): Bảo, Phú, My đều chờ
2. [ ] Chốt 4 user mẫu và công cụ test RLS (mục 4)

## 3. Nhật ký phiên

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/database/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 2 điền mục 4.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | 4 user mẫu đóng vai gì. Gợi ý: host, member cùng room, bạn của host không vào room, người lạ | My |
| 2026-11-19 | Test RLS bằng pgTAP (`supabase test db`) hay Vitest | My |
| 2026-11-19 | `supabase/config.toml` và job CI chạy Supabase | Gói 1 |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
