# Gói 3: Contracts và mock

Người phụ trách: Phú. Mã checklist: `K3-01` đến `K3-08`.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Thiết kế liên quan | `docs/design/contracts.md`, `docs/design/realtime.md` |

## Việc

1. Viết `core/contracts/`: 5 port, 2 plugin, FrameManifest, type của event trong room. Push lên `dev` sớm nhất để Gói 4, Gói 5 dựa vào.
2. Viết 3 adapter mock: `RoomPort`, `RoomBus` (cùng dùng `BroadcastChannel`), `MediaSource` (video `.mp4` chạy lặp).
3. Viết `core/adapters/index.ts`: chọn cặp adapter realtime và chọn `MediaSource` độc lập bằng `.env`.
4. Viết feature flag trong `core/config/`.
5. Viết unit test: mock chạy đúng contract.

## Ràng buộc đã chốt

| Ràng buộc | Nguồn |
|---|---|
| 5 port: `AuthPort`, `RoomPort`, `RoomBus`, `StoragePort`, `MediaSource`. 2 plugin: `Effect`, `StudioTool` | `contracts.md` mục 2, 3 |
| `AuthPort`, `StoragePort` không có mock: dùng Supabase local | `contracts.md` mục 2 |
| Đọc ghi DB và lệnh của host không qua port | `contracts.md` mục 1 |
| `participants` của `RoomPort` trả attribute `role` | `contracts.md` mục 2 |
| Event: `START_SHOT { round, delayMs }`, `READY { ready }`, `SHOT_UPLOADED { round }`, `ROOM_CHANGED` không có payload | `realtime.md` mục 4 |
| Mock giữ luật của bản real: chỉ chấp nhận `START_SHOT` từ participant có role `host` | `realtime.md` mục 7 |
| FrameManifest: `version`, `width`, `height`, `overlay`, `slots` | `contracts.md` mục 4 |
| Sửa contracts thì báo nhóm trước khi merge | `contracts.md` mục 5 |

## Sở hữu

| File, thư mục | Ghi chú |
|---|---|
| `core/contracts/` | Không import gì khác trong repo |
| `core/adapters/index.ts`, `core/adapters/selector.ts`, `core/adapters/mock/` | Adapter real thuộc Gói 4 |
| `core/config/` | |

## Export qua `index.ts`

| Điểm import | Export |
|---|---|
| `@/core/contracts` | `AuthPort`, `StoragePort`, `RoomPort`, `RoomBus`, `MediaSource`, `Effect`, `StudioTool`, `FrameManifest` v1 và các type hỗ trợ cho event, participant, payload và plugin |
| `@/core/adapters` | `createAdapterSelector`, `createMockRealtime`, `createMockMediaSource` và type `AdapterFactories`, `RealtimeAdapters`, `MockRealtimeOptions` |
| `@/core/config` | `readAdapterConfig` và type `AdapterConfig` |

## Bàn giao cho Gói 4 và Gói 5

1. Import type của port, plugin và event từ `@/core/contracts`. Import `createAdapterSelector` và các factory mock
   từ `@/core/adapters`.
2. Ở server, gọi `readAdapterConfig()` từ `@/core/config`. Hàm đọc `REALTIME_ADAPTER` và `MEDIA_ADAPTER`. Mỗi biến
   nhận `real` hoặc `mock`, mặc định `real` khi bỏ khai báo. Truyền kết quả `{ realtime, media }` qua props sang client.
   Client giữ một selector cho mỗi phạm vi room hoặc booth và cung cấp factory tại client.
3. Khi gọi `createAdapterSelector(config, factories)`, Gói 4 cung cấp `realRealtime: () => ({ room, bus })` dùng chung
   một kết nối và `realMedia: () => mediaSource`. Lấy adapter qua `getRealtime()` và `getMediaSource()`. Chế độ `real`
   cần factory tương ứng.
4. Với realtime mock, truyền `mockRealtime` gồm `identity`, `getHostIdentity` và `onRoomStateChanged` nếu role có thể đổi.
   Có thể lấy cặp port trực tiếp từ `createMockRealtime(options)` trong test. Đăng ký `onParticipantsChanged`, đọc snapshot
   đầu tiên và đọc lại `participants()` mỗi khi có thông báo. Hủy đăng ký listener của room và bus rồi gọi `room.leave()`
   khi kết thúc phạm vi sử dụng. Khi host gửi `START_SHOT`, host tự bắt đầu countdown tại tab của mình.
5. Với media mock, gọi `getMediaSource().getStream()` hoặc `createMockMediaSource().getStream()` trong test trình duyệt.
   Booth giữ một stream cho preview, publish và xử lý frame. Khi rời booth, gọi `room.leave()` để kết thúc publish.
   Booth luôn dừng toàn bộ track và bỏ stream khỏi preview, kể cả khi `leave()` báo lỗi. Adapter giải phóng timer, canvas
   và video nguồn.

Mock realtime chạy giữa các tab cùng origin, mô phỏng `publishTrack()` và gửi event đến các tab khác. Role đến từ state
của room hoặc dữ liệu test. Quyền của bản real do server và LiveKit xác thực. Mock media phát video mẫu H.264 qua
`canvas.captureStream()` và chỉ có video track. Fixture dùng để kiểm tra frame, preview và luồng shot.

Trước khi merge, báo nhóm về public contract. Gói 4 review ánh xạ event participant và cung cấp hai factory real.
Gói 5 review cách truyền config và kiểm tra vòng đời room, subscription và media stream khi tích hợp.

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| Factory real cho realtime và media, ánh xạ event participant | Gói 4 | Tích hợp K3-06 và kiểm tra `onParticipantsChanged()` với LiveKit |
| Cấu hình từ server tới consumer, cleanup room và stream | Gói 5 | Kiểm tra selector và vòng đời trong booth |
