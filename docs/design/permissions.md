# Vai trò và quyền

## 1. Vai trò

**Vấn đề:** cùng một người có quyền khác nhau tuỳ đang ở room nào và đang xem strip nào.

**Cách xử lý:** không có vai trò hệ thống; mọi tài khoản là user. Quyền tính theo quan hệ với room, strip hoặc asset.

| Phạm vi | Vai trò | Xác định bằng |
|---|---|---|
| Room | host | `rooms.host_id` |
| Room | member | Dòng trong `room_members`, `kicked_at` null |
| Strip | owner | Dòng trong `strip_owners`: người có mặt trong strip; strip personal chỉ có người tạo |
| Strip | viewer | Người xem được strip theo mục 2 |
| Asset | owner | `assets.owner_id`; asset có sẵn của hệ thống có `owner_id` null |

## 2. Visibility của strip

**Vấn đề:** strip shared có mặt nhiều người. Một owner mở công khai thì lộ mặt các owner khác.

**Cách xử lý:** mỗi owner chọn visibility của mình trong `strip_owners.visibility`. Viewer xem được strip khi **mọi**
owner đều cho phép.

| Visibility | Owner cho phép ai | Mặc định |
|---|---|---|
| `private` | Chỉ owner đó | |
| `session` | Thêm member của room trong session tạo ra strip | Có |
| `friends` | Thêm bạn bè của owner đó | |
| `link` | Thêm người có link | |

Mỗi mức gồm cả các mức trên nó. Hàm SQL `can_view_strip()` giữ luật này; policy RLS và Route Handler đều gọi hàm này.

RLS không phân biệt "có link" với "liệt kê bảng". Vì vậy RLS xử lý `link` như `friends`. Người có link mở strip qua
Route Handler: Route Handler kiểm tra `strips.share_token`, rồi trả signed URL của ảnh.

## 3. Bảng quyền

| Việc | Ai được làm |
|---|---|
| Tạo room | Mọi user |
| Vào room | Có link hoặc PIN; room không lock; chưa bị kick |
| Lock, kick, đổi settings, chuyển host | host |
| Chọn frame, xếp slot | host |
| Host rời room | Hệ thống chuyển host cho member vào sớm nhất còn trong room |
| Chỉnh chung strip shared | Mọi member của session; lock theo từng object |
| Lưu bản personal để chỉnh tiếp | Mọi member của session |
| Xem, tải strip | Theo mục 2 |
| Đổi visibility của mình, tạo link, gỡ strip khỏi gallery của mình | owner |
| Thả tim, bình luận | Người xem được strip |
| Xoá bình luận | Người viết hoặc owner của strip |
| Gửi, nhận lời mời kết bạn | Mọi user |
| Huỷ kết bạn | Một trong hai người |
| Upload asset | Mọi user |
| Sửa, xoá asset | owner của asset |
| Dùng asset | Asset `public`; owner của asset; member của room đang dùng asset đó làm frame |

Gỡ strip khỏi gallery của mình chỉ ẩn strip với owner đó; không đổi quyền xem của người khác.

## 4. Ba lớp kiểm tra

**Vấn đề:** chỉ ẩn nút trên giao diện thì member gọi thẳng API hoặc database là vượt được.

**Cách xử lý:**

| Lớp | Chặn bằng |
|---|---|
| Database | RLS gọi hàm SQL dùng chung (`can_view_strip()`, `is_room_host()`...) |
| Server và booth | Route Handler kiểm tra quyền trước khi ghi; participant attribute `role` do server đặt |
| Giao diện | Hàm `can()` ẩn hoặc hiện nút |

- Bảng luật trong `can()` viết song song với hàm SQL; hai bên phải khớp.
- Đổi luật quyền thì chạy lại test RLS với 4 user mẫu. Test RLS chạy trong CI ở mọi PR vào `dev`.
