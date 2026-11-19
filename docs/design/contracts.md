# Port, plugin và FrameManifest

5 người code song song. UI không gọi thẳng SDK của LiveKit hay webcam, mà gọi port trong `core/contracts/`. Mỗi port có
bản real và bản mock, chọn bằng `.env`. Database luôn chạy Supabase thật (local hoặc cloud).

## 1. Cái gì đi qua port

**Vấn đề:** viết mock cho mọi thứ thì tốn công, và mock không kiểm tra RLS. Không có mock thì người làm UI booth phải có
LiveKit và webcam mới chạy được.

**Cách xử lý:** chỉ phần phụ thuộc LiveKit, webcam, Storage và Auth đi qua port. Đọc ghi database không qua port.

| Việc | Đi qua | Ghi chú |
|---|---|---|
| Đăng nhập, video call, event trong room, upload ảnh, camera | Port | Mục 2 |
| Đọc ghi bảng (gallery, bạn bè, comment, state của room) | Hàm truy vấn trong từng module, dùng Supabase client có type sinh từ DB | Dev chạy Supabase local với seed chung; RLS chạy thật |
| Lệnh của host (đổi frame, xếp slot, lock, kick, chuyển host) | Hàm trong `modules/room/`, gọi Route Handler | Gọi xong thì gửi `ROOM_CHANGED` qua RoomBus |

## 2. Port

| Port | Hàm | Real | Mock |
|---|---|---|---|
| `AuthPort` | `currentUser`, `signIn`, `signOut`, `onChange` | Supabase Auth (local hoặc cloud) | Không có. Trang `/dev` có nút đăng nhập nhanh 4 user trong seed |
| `RoomPort` | `join`, `leave`, `participants`, `publishTrack` | LiveKit | `BroadcastChannel` giữa các tab cùng máy |
| `RoomBus` | `send`, `on` | Data packet reliable của LiveKit | `BroadcastChannel` |
| `StoragePort` | `upload`, `getUrl`, `remove` | Supabase Storage; upload lỗi thì lưu vào IndexedDB, đồng bộ lại khi có mạng | Không có |
| `MediaSource` | `getStream` | Webcam qua `getUserMedia` | Video `.mp4` chạy lặp |

- `participants` của `RoomPort` trả cả participant attribute `role`.
- Chọn adapter riêng cho từng port bằng `.env`: được dùng LiveKit thật với video mock, hoặc ngược lại.
- Room dùng mock: Route Handler bỏ qua lời gọi LiveKit server API.
- `AuthPort` và `StoragePort` không có mock: Supabase local đã chạy offline, có Auth và Storage.

## 3. Plugin

**Vấn đề:** effect của camera và công cụ của studio do nhiều người viết, thêm dần theo thời gian.

**Cách xử lý:** mỗi effect, mỗi công cụ là một plugin theo interface chung. Khung booth và khung studio chỉ gọi interface,
không biết plugin cụ thể.

| Plugin | Hàm | Ví dụ |
|---|---|---|
| `Effect` | `init`, `process`, `dispose`, `params` | Tách nền, filter LUT, accessory |
| `StudioTool` | `activate`, `deactivate`, `panel` | Chỉnh màu, sticker, text, đổi frame |

`process` của `Effect` nhận một frame video và trả frame đã xử lý. Booth gọi các `Effect` theo thứ tự trên mỗi frame video.

## 4. FrameManifest

**Vấn đề:** frame do user upload. Booth, studio và bước xuất strip phải hiểu frame giống nhau.

**Cách xử lý:** mỗi frame có một FrameManifest, lưu ở `assets.manifest`.

| Trường | Nghĩa |
|---|---|
| `version` | Phiên bản cấu trúc manifest |
| `width`, `height` | Kích thước canvas, đơn vị px |
| `overlay` | Đường dẫn Storage của PNG viền; vẽ đè lên shot, chỗ trống trong suốt |
| `slots` | Danh sách slot: `x`, `y`, `width`, `height`, `radius` (bo góc), đơn vị px |

`room_members.slot_index` là vị trí trong `slots`.

## 5. Sửa contracts

`core/contracts/` là chỗ mọi gói dựa vào. Sửa contracts thì báo nhóm trước khi merge.
