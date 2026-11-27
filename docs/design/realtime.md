# Realtime trong room

Room có host và các member. Cả room video call qua LiveKit. Host điều khiển room: chọn frame, xếp slot, lock, kick,
bấm chụp. Member vào sau, mất mạng rồi vào lại, hoặc bị kick đều phải thấy đúng state của room.

## 1. Tách state, lệnh quyền và event

**Vấn đề:** gửi mọi thứ qua một bus thì có ba lỗi:

- Host mất mạng: member vào sau không ai gửi state của room cho.
- Client tự lọc lệnh quyền: member sửa code là vượt được.
- LiveKit không lưu packet; Supabase Broadcast không cho biết ai gửi.

**Cách xử lý:** mỗi loại thông tin đi một đường.

| Loại | Ví dụ | Nguồn sự thật | Đi qua |
|---|---|---|---|
| State | frame, slot, settings, lock, danh sách member, host | Bảng `rooms`, `room_members` | Đọc DB qua TanStack Query |
| Lệnh quyền | đổi frame, xếp slot, lock, kick, chuyển host | Route Handler kiểm tra quyền rồi ghi DB | API |
| Event chụp | `START_SHOT` | Event và claim trong DB; server xác thực | Route Handler và data packet của LiveKit |
| Event tức thời khác | `READY`, `SHOT_UPLOADED` | Không lưu | Data packet của LiveKit |

Không có message `ROOM_STATE`: member vào sau đọc state từ DB.

## 2. Role của participant

**Vấn đề:** người nhận event phải biết chắc người gửi là host.

**Cách xử lý:**

- LiveKit server ghi đè danh tính người gửi lên mỗi data packet. Client không giả mạo được người gửi.
- Role nằm trong participant attribute `role` (`host` hoặc `member`). Route Handler cấp token ghi role ban đầu.
- Token cấp với `canUpdateOwnMetadata = false`. Bật quyền này thì member tự sửa được attribute `role` của mình.
- Chỉ server đổi attribute, bằng `RoomService.UpdateParticipant`.
- Route Handler từ chối cấp token khi `room_members.kicked_at` khác null hoặc room đang lock.
- Token cũ có thể khôi phục attribute sau khi đổi host. `START_SHOT` real phải được server ký, kiểm tra state hiện tại và claim chống replay; không dùng attribute làm bằng chứng đủ. Mock tiếp tục mô phỏng theo role để phát triển offline.
- Token real và lệnh kick, chuyển host, leave real vẫn bị chặn vì event đã ký không thu hồi quyền media hoặc token cũ.

## 3. Lệnh quyền

**Vấn đề:** lệnh đổi state phải chặn được ở server, và mọi người trong room phải thấy thay đổi ngay.

**Cách xử lý:** lệnh của host là hàm trong `modules/room/`, gọi Route Handler; không qua port. Route Handler kiểm tra
host, ghi DB, rồi gọi LiveKit server API khi lệnh cần.

| Lệnh | Route Handler làm | Room biết bằng |
|---|---|---|
| Đổi frame, xếp slot, đổi settings, lock | Ghi DB | Client vừa gọi gửi `ROOM_CHANGED` qua RoomBus khi API trả 2xx |
| Kick | Ghi `kicked_at`, gọi `RoomService.RemoveParticipant` | Như trên. Người bị kick: LiveKit ngắt kết nối kèm lý do bị remove, client báo đã bị kick |
| Host rời room | Webhook `participant_left`: chuyển host cho member vào sớm nhất còn trong room, ghi DB, gọi `RoomService.UpdateParticipant` đổi attribute `role` | Event `ParticipantAttributesChanged` của LiveKit tới mọi client |

- Client tải lại state từ DB khi nhận `ROOM_CHANGED` hoặc khi attribute `role` của một participant đổi.
- UI nhận thay đổi participant qua `RoomPort.onParticipantsChanged` và đọc role mới qua `participants()`.
- `ROOM_CHANGED` không mang dữ liệu, nên packet giả chỉ gây một lần tải lại.
- `livekit-server --dev` ở local có cùng server API và gọi được webhook về `localhost`. LiveKit Cloud không gọi tới được máy local.
- Adapter mock (không có LiveKit): Route Handler bỏ qua lời gọi LiveKit server API. Người bị kick biết qua `kicked_at` khi tải lại state.

## 4. Event tức thời

**Vấn đề:** event cần độ trễ thấp và không cần lưu.

**Cách xử lý:** gửi data packet reliable (giữ thứ tự, tối đa 15 KiB) trên LiveKit.

| Event | Payload | Ai được gửi | Người nhận kiểm tra |
|---|---|---|---|
| `START_SHOT` | `sessionId`, `requestId`, `round`, `delayMs` | host | Real yêu cầu server xác minh chữ ký, state và claim; mock kiểm tra role giả lập |
| `READY` | `ready` | Mọi member | |
| `SHOT_UPLOADED` | `round` | Mọi member | |
| `ROOM_CHANGED` | Không có | Client vừa gọi lệnh host thành công | Không kiểm tra; chỉ tải lại state |

Packet không lưu trên LiveKit. Server lưu metadata `START_SHOT` và claim để chống replay; chưa có job dọn event. Member vào giữa round không nhận `START_SHOT` của round đó và chờ round sau.

## 5. Countdown

**Vấn đề:** mỗi máy nhận `START_SHOT` ở thời điểm khác nhau.

**Cách xử lý:** mỗi máy chụp camera của chính mình, nên không cần đồng bộ đồng hồ. Máy xác minh và claim `START_SHOT` thành công thì đếm `delayMs` rồi chụp. Các máy có thể lệch nhau do độ trễ packet và xác minh; không bảo đảm mọi máy nhận event.

## 6. Studio

Studio không dùng LiveKit: studio chạy cả khi đã tắt video call và khi chỉnh riêng sau buổi chụp. Studio dùng Supabase
Realtime Broadcast và Presence trên private channel.

Supabase kiểm tra quyền khi join channel, không kiểm tra từng message, và cache quyền suốt kết nối. Thu quyền một user
chỉ có hiệu lực khi JWT của user đó hết hạn.

## 7. Adapter mock

Adapter mock của `RoomPort` và `RoomBus` dùng `BroadcastChannel` giữa các tab cùng máy. Mock chỉ chấp nhận `START_SHOT` từ participant có role `host` theo state giả lập. Mock không mô phỏng chữ ký, claim hoặc bảo đảm quyền của bản real.

Adapter mock nhận thông báo khi state của room đổi để cập nhật role trong snapshot. Adapter real có thể dùng các event
participant của LiveKit cho cùng subscription.

## 8. Giới hạn gói free

| Dịch vụ | Giới hạn |
|---|---|
| LiveKit Cloud (Build) | 5.000 phút-người mỗi tháng, 100 kết nối đồng thời, 50 GB downstream |
| Supabase Realtime (Free) | 200 kết nối đồng thời, 100 message/s |

Buổi 4 người chụp 15 phút tốn 60 phút-người. Dev test booth bằng `livekit-server --dev` hoặc mock; LiveKit Cloud chỉ dùng
trên staging và main.
