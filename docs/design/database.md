# Database và Storage

Supabase Postgres giữ mọi state cần lưu: user, bạn bè, room, session, shot, strip, asset do user upload. Supabase Storage
giữ file ảnh. Quyền đọc ghi chặn bằng RLS; luật quyền mô tả trong file thiết kế về vai trò và quyền.

## 1. Bảng

**Vấn đề:** 5 người viết code trên cùng schema. Bảng hoặc cột mơ hồ thì mỗi người hiểu một kiểu.

**Cách xử lý:** 11 bảng. Mỗi thông tin nằm ở đúng một bảng.

| Bảng | Cột | Ghi chú |
|---|---|---|
| `profiles` | `id`, `username`, `display_name`, `avatar_url` | `id` trùng `auth.users.id`; trigger tạo dòng khi đăng ký |
| `friendships` | `requester_id`, `addressee_id`, `status` (`pending`, `accepted`) | Mỗi cặp user một dòng, không phụ thuộc ai gửi. Huỷ kết bạn hoặc từ chối: xoá dòng |
| `rooms` | `id`, `host_id`, `pin`, `status` (`open`, `locked`, `editing`, `ended`), `frame_id`, `settings` | `pin` không trùng giữa các room chưa `ended` |
| `room_members` | `room_id`, `user_id`, `slot_index`, `kicked_at` | `created_at` là lúc vào room; dùng để chọn host mới. Không có cột role: host lấy từ `rooms.host_id` |
| `sessions` | `id`, `room_id`, `frame_id`, `started_at` | Một room có nhiều session |
| `shots` | `id`, `session_id`, `user_id`, `round`, `storage_path` | |
| `strips` | `id`, `session_id`, `kind` (`shared`, `personal`), `created_by`, `canvas_json`, `export_path`, `share_token` | `share_token` có khi một owner tạo link |
| `strip_owners` | `strip_id`, `user_id`, `visibility` (`private`, `session`, `friends`, `link`), `hidden_at` | `visibility` mặc định `session`. `hidden_at`: owner gỡ strip khỏi gallery của mình |
| `reactions` | `strip_id`, `user_id`, `type` | Mỗi user một reaction trên một strip |
| `comments` | `id`, `strip_id`, `user_id`, `body` | |
| `assets` | `id`, `owner_id`, `kind` (`frame`, `sticker`, `filter`, `accessory`), `name`, `storage_path`, `manifest`, `visibility` (`private`, `public`), `deleted_at` | `owner_id` null: asset có sẵn của hệ thống, nạp bằng seed |

`rooms.frame_id` và `sessions.frame_id` trỏ tới `assets` có `kind = 'frame'`.

## 2. Luật chung của schema

- Mọi `id` dùng `uuid`.
- Mọi bảng có cột `created_at`.
- `status`, `kind`, `visibility`, `type` dùng `text` kèm `check`, không dùng enum của Postgres. Thêm giá trị mới chỉ cần sửa `check`.
- `rooms.settings`, `assets.manifest` dùng `jsonb`.
- Mỗi khoá ngoại ghi rõ `on delete cascade` hoặc `on delete set null`.
- `canvas_json` và `manifest` có trường `version`, để đổi cấu trúc sau này không vỡ dữ liệu cũ.

## 3. Asset do user upload

**Vấn đề:** user tự upload frame, sticker, filter, accessory. Asset đang được strip dùng mà bị xoá thì strip đó không mở
lại để chỉnh được.

**Cách xử lý:**

| `kind` | File | `manifest` |
|---|---|---|
| `frame` | PNG viền | FrameManifest: kích thước canvas, danh sách slot (x, y, rộng, cao, bo góc) |
| `sticker` | PNG | |
| `filter` | LUT PNG 512×512 (64³ màu, xếp 8×8 ô) | |
| `accessory` | PNG | Điểm neo trên khuôn mặt |

- Filter nhận file LUT PNG hoặc `.cube`. Client đổi `.cube` sang LUT PNG trước khi upload; Storage chỉ giữ PNG.
- Filter chỉ là LUT, không nhận code shader. Shader của người khác có thể làm treo GPU của cả room.
- Xoá asset: đặt `deleted_at`. Asset ẩn khỏi thư viện nhưng strip đang dùng vẫn đọc được.

## 4. Storage

| File | Đường dẫn |
|---|---|
| Shot | `sessions/{sessionId}/{round}/{userId}.jpg`, JPEG chất lượng 0,92 |
| Strip xuất ra | `strips/{stripId}.png` |
| Asset | `assets/{ownerId}/{assetId}.png` |

- Bucket ảnh của user là private. Client lấy ảnh bằng signed URL.
- Upload shot lỗi: shot lưu vào IndexedDB, đồng bộ lại khi có mạng.
- Storage gói free: 1 GB mỗi project.

## 5. Dọn shot

**Vấn đề:** Storage gói free có 1 GB. Shot chiếm phần lớn dung lượng, nhưng strip personal cần shot gốc để chỉnh tiếp.

**Cách xử lý:** shot hết hạn sau `SHOT_RETENTION_HOURS` giờ tính từ khi session `ended`.

| Môi trường | `SHOT_RETENTION_HOURS` | Chạy dọn |
|---|---|---|
| local | 5 | Lệnh dọn chạy tay |
| staging, main | 24 | Job GitHub Actions mỗi ngày |

- Job dọn xoá file qua Storage API bằng key secret, rồi xoá dòng `shots`. Không xoá bằng SQL trên `storage.objects`: làm vậy chỉ mất dòng, file vẫn nằm trong bucket.
- Shot đã xoá: strip vẫn còn ảnh ở `export_path`. Chỉnh tiếp thì chỉnh trên ảnh đã xuất, không tách lại được từng shot.

## 6. Migration

**Vấn đề:** migration chạy tự động lên staging và main. Sửa migration cũ hoặc đổi cột một bước thì làm hỏng dữ liệu
thật hoặc làm sập bản đang chạy.

**Cách xử lý:**

1. Migration đã push: không sửa. Muốn đổi thì tạo migration mới.
2. Đổi tên cột: thêm cột mới, copy dữ liệu, sửa code, rồi mới drop cột cũ ở migration sau.
3. Backup database main trước khi drop bảng hoặc cột.
4. Đóng băng migration lên main trước ngày bảo vệ.
