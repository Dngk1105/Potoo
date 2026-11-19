# BUILD-TRACK: `server-api` (Gói 4)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K2-07 | Route Handler cấp token LiveKit có `role` | [ ] | `app/api/` | Chuyển từ Gói 2 |
| K4-01 | Real Supabase Auth | [ ] | `core/adapters/real/` | |
| K4-02 | Real `RoomBus` bằng LiveKit data packet | [ ] | `core/adapters/real/` | |
| K4-03 | Real `RoomPort` bằng LiveKit | [ ] | `core/adapters/real/` | Sheet có screen share: không cần |
| K4-04 | Real Supabase Storage | [ ] | `core/adapters/real/` | Upload lỗi lưu IndexedDB, đồng bộ lại |
| K4-05 | Route Handler lệnh của host | [ ] | `app/api/` | Sheet ghi "CRUD rooms": thêm kick, đổi frame, xếp slot, chuyển host |
| K4-06 | Route Handler shot, strip | [ ] | `app/api/` | Thêm mở strip bằng `share_token` |
| K4-07 | Webhook LiveKit | [ ] | `app/api/` | `participant_left`: chuyển host. Kiểm chữ ký webhook |
| K4-08 | Test tích hợp adapter real | [ ] | | |

## 2. Cần làm tiếp

1. [ ] Chọn người phụ trách Gói 4
2. [ ] Thêm việc cho real `MediaSource` (webcam) vào sheet

## 3. Nhật ký phiên

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/server-api/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 4 điền `api.md` và mục 4.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | Real `MediaSource` (webcam) chưa có mã việc trên sheet | Người phụ trách Gói 4 |
| 2026-11-19 | Đường dẫn các Route Handler | Người phụ trách Gói 4 |
| 2026-11-19 | `core/contracts/` | Gói 3 |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
