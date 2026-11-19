# Viết docs

## Ví dụ

| Không | Có |
|---|---|
| Ai vào phòng sau thì chủ phòng gửi lại thông tin cho. | Member mới vào: host gửi `ROOM_STATE` gồm frame, slot và settings. |
| Ảnh lỗi mạng thì lưu tạm rồi gửi sau. | Upload shot lỗi: shot lưu vào IndexedDB, đồng bộ lại khi có mạng. |
| Về cơ bản CI sẽ deploy khi cần. | Merge vào `main`: GitHub Actions chạy migration lên project Supabase main, Vercel deploy production. |

## Ngôn ngữ

- Tên file tiếng Anh, kebab-case. Nội dung viết câu tiếng Việt có dấu.
- Thuật ngữ viết đúng `term` trong `docs/glossary.yaml`, không dịch.
- Thuật ngữ chưa có trong glossary: thêm vào glossary trước, rồi mới dùng.
- Tên hàm, file, lệnh, bảng, cột, biến môi trường đặt trong backtick: `can_view_strip()`, `.env.local`.

## 5C

| Quy tắc | Nghĩa | Không | Có |
|---|---|---|---|
| Clear | Câu đơn, một nghĩa | "Người có quyền thì làm được việc của phòng" | "Chỉ host được lock room, kick, đổi settings." |
| Concise | Bỏ chữ thừa, đi thẳng vào việc | "Khi mà migration đã được đẩy lên rồi thì không nên sửa" | "Migration đã push: không sửa." |
| Complete | Đủ bước, thông số, điều kiện | "Khoá tự nhả khi mất mạng." | "Lock tự nhả khi Presence báo rời phòng, hoặc sau TTL 15 s." |
| Correct | Tên dịch vụ, version, giới hạn đã kiểm | Số không rõ nguồn | Số lấy từ code, docs hoặc trang chính thức. Chưa có thì hỏi người làm |
| Concrete | Định tính đổi thành định lượng | "Storage có giới hạn." | "Storage gói free: 1 GB mỗi project." |

## Giọng văn

- Mẫu câu: `[chủ thể] [làm gì] [vì sao/khi nào]`.
- Mỗi đoạn một ý. Bước làm thì đánh số, mỗi bước một hành động.
- Bỏ từ đệm: "về cơ bản", "thực ra", "có lẽ", "thường thì", "khá", "một chút".
- Bỏ đại từ thừa ("chúng ta", "bạn") khi chủ thể đã rõ.

## Nội dung

- Docs chỉ mô tả mức hệ thống: các khối, luồng, ranh giới, lý do, ràng buộc. Chi tiết triển khai đọc từ code, không chép vào docs.
- Docs đi trước code: thiết kế đã chốt thì ghi vào docs trước, rồi mới viết code theo docs. Docs không được sai so với code.
- Docs chỉ ghi điều đã chốt và đang đúng. Điều đang bàn để trong chat hoặc nhóm.
- Ít code, câu dễ hiểu.
- Quan hệ giữa các khối viết bằng bảng, mỗi quan hệ một ô. Không vẽ sơ đồ bằng ký tự.

## Cấu trúc thư mục

| Nơi | Chứa gì | Khung |
|---|---|---|
| `docs/architecture.md` | Toàn cảnh, bảng "Gặp vấn đề thì đọc file nào" | Chỉ file này được link sang file thiết kế khác |
| `docs/design/<vấn-đề>.md` | Một vấn đề thiết kế đã chốt | Vấn đề → Cách xử lý. Tự đứng được: chép lại vài câu ngữ cảnh thay vì link |
| `docs/modules/<gói>/README.md` | Gói làm gì, sở hữu thư mục nào, cần gì từ gói khác | Bảng |
| `docs/modules/<gói>/BUILD-TRACK.md` | Đầu việc theo mã checklist (`K0-09`...), trạng thái, ghi chú | `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại |
| `docs/glossary.yaml` | Thuật ngữ | |

- Thêm file thiết kế mới thì thêm dòng vào bảng "Gặp vấn đề" trong `architecture.md`.
- Quyết định mới: ghi vào file thiết kế của vấn đề đó; vấn đề mới thì tạo file mới. Lịch sử thay đổi xem bằng git.
- `BUILD-TRACK.md` do người phụ trách gói cập nhật. Không đánh `[x]` khi chưa chạy kiểm chứng ghi trong cột DoD.
