# Gói 5: Giao diện khung và luồng room

Người phụ trách: chưa có. Mã checklist: `K5-01` đến `K5-08`.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Màn hình | [`screens.md`](screens.md) |
| Thiết kế liên quan | `docs/design/contracts.md` (port, mock), `docs/design/permissions.md` (`can()`) |

## Việc

1. Chọn thư viện component và cách đưa thiết kế Figma vào code (mục "Gói 5 tự quyết").
2. Dựng `core/ui/`: token, component dùng chung, light và dark.
3. Dựng layout, routing, đăng nhập, route guard.
4. Dựng sảnh tạo/vào room, lobby, khung booth nhận `MediaSource`.
5. Dựng trang `/dev/*` chạy bằng mock, trang lỗi, hướng dẫn bật camera.

## Gói 5 tự quyết

Ghi quyết định vào `docs/design/ui.md` (tạo khi chốt), rồi thêm dòng vào bảng "Gặp vấn đề" của `docs/architecture.md`.

| Cần quyết | Ghi chú |
|---|---|
| Thư viện component (shadcn/ui, thư viện khác, tự viết) | Tailwind 4 đã cài sẵn |
| Token đi từ Figma sang code thế nào | Figma Variables có light và dark là nguồn; file token sinh ra thì không sửa tay |
| Bảng "component Figma → component code, variant → prop" | Thay cho Code Connect (xem mục Ràng buộc) |
| Nơi designer duyệt component | Trang `/dev/ui` hoặc Storybook |
| Luật để AI viết UI đúng | Ví dụ: chỉ dùng component trong `core/ui`, không mã màu hex, không giá trị tuỳ ý của Tailwind |

## Ràng buộc đã biết

| Ràng buộc | Ảnh hưởng |
|---|---|
| Cả nhóm dùng gói Figma Education | Figma MCP: ghế Full hoặc Dev gọi tối đa 200 lần/ngày, 10 lần/phút. Ghế View, Collab: 20 lần/tháng |
| Code Connect chỉ có ở gói Organization, Enterprise | Không dùng được; cần bảng ánh xạ trong docs |
| UI gọi port, không gọi thẳng SDK LiveKit hay webcam | Dựng UI booth bằng mock `RoomPort`, `MediaSource` |
| Hiện hay ẩn nút theo quyền dùng `can()` | Bảng luật do Gói 4 viết |

## Sở hữu

| File, thư mục | Ghi chú |
|---|---|
| `core/ui/` | Token, component dùng chung |
| `app/(auth)/`, `app/room/`, `app/dev/` | Route |
| `modules/room/` | Sảnh, lobby, lệnh của host |

## Export qua `index.ts`

| Tên | Loại (component, hook, hàm) | Dùng bởi |
|---|---|---|
| | | |

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| File Figma: Variables light/dark, text style, component có variant | Người thiết kế | `K5-01` |
| `core/contracts/` và adapter mock | Gói 3 | Dựng UI không cần LiveKit, webcam |
| Real Auth adapter | Gói 4 | `K5-03` |
| Bảng luật `can()` | Gói 4 | Ẩn hiện nút |
