# BUILD-TRACK: `contracts` (Gói 3)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K3-01 | `core/contracts/` | [ ] | `core/contracts/index.ts` | Không phụ thuộc type DB |
| K3-02 | Mock `AuthPort` | — | | Bỏ: dùng Supabase local |
| K3-03 | Mock `RoomPort`, `RoomBus` | [ ] | `core/adapters/mock/` | Sheet ghi `core/ports/mock/`: dùng `core/adapters/mock/` |
| K3-04 | Mock `StoragePort` | — | | Bỏ: dùng Supabase local |
| K3-05 | Mock `MediaSource` | [ ] | `core/adapters/mock/` | |
| K3-06 | Chọn adapter theo `.env` | [ ] | `core/adapters/index.ts` | Chọn riêng từng port |
| K3-07 | Feature flag | [ ] | `core/config/` | |
| K3-08 | Unit test cho mock | [ ] | | |

## 2. Cần làm tiếp

1. [ ] Chọn người phụ trách Gói 3
2. [ ] K3-01: push `core/contracts/` lên `dev` sớm nhất

## 3. Nhật ký phiên

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/contracts/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 3 điền mục 4.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | Tên biến `.env` chọn adapter của từng port | Người phụ trách Gói 3 |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
