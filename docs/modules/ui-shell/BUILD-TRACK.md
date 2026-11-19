# BUILD-TRACK: `ui-shell` (Gói 5)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K5-01 | Thư viện component, token, design system | [ ] | `core/ui/` | Sheet ghi shadcn/ui: Gói 5 chọn lại |
| K5-02 | Layout, navigation | [ ] | `app/layout.tsx` | |
| K5-03 | Đăng nhập, đăng ký, route guard | [ ] | `app/(auth)/` | Next 16: `middleware.ts` đổi tên thành `proxy.ts` |
| K5-04 | Sảnh tạo room, vào room | [ ] | `modules/room/` | |
| K5-05 | Trang `/dev/*` chạy bằng mock | [ ] | `app/dev/` | |
| K5-06 | Lobby | [ ] | `app/room/` | Dựng bằng mock `RoomPort` |
| K5-07 | Trang lỗi, hướng dẫn bật camera | [ ] | `app/not-found.tsx`, `app/error.tsx` | |
| K5-08 | Kiểm tra responsive mobile, laptop | [ ] | | |

## 2. Cần làm tiếp

1. [ ] Chọn người phụ trách Gói 5
2. [ ] Chốt các mục "Gói 5 tự quyết" trong `README.md`

## 3. Nhật ký phiên

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/ui-shell/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 5 điền mục 4 và README.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | Thư viện component, đường token Figma → code, nơi duyệt component | Người phụ trách Gói 5 |
| 2026-11-19 | File Figma có Variables light/dark, text style, component có variant | Người thiết kế |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
