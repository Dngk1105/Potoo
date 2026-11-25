# Gói 3: Contracts và mock

Người phụ trách: Phú. Mã checklist: `K3-01` đến `K3-08`.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Thiết kế liên quan | `docs/design/contracts.md`, `docs/design/realtime.md` |

## Việc

1. Viết `core/contracts/`: 5 port, 2 plugin, FrameManifest, type của event trong room. Push lên `dev` sớm nhất để Gói 4, Gói 5 dựa vào.
2. Viết 3 adapter mock: `RoomPort`, `RoomBus` (cùng dùng `BroadcastChannel`), `MediaSource` (video `.mp4` chạy lặp).
3. Viết `core/adapters/index.ts`: chọn adapter riêng cho từng port bằng `.env`.
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
| `core/adapters/index.ts`, `core/adapters/mock/` | Adapter real thuộc Gói 4 |
| `core/config/` | |

## Export qua `index.ts`

| Tên | Loại (component, hook, hàm) | Dùng bởi |
|---|---|---|
| Interface 5 port, 2 plugin | Type | Gói 4, Gói 5, mọi module |
| `FrameManifest`, type event trong room | Type | booth, studio, Gói 4 |
| Hàm lấy adapter theo `.env` | Hàm | Gói 5, mọi module |

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| Không có | | Gói 3 bắt đầu được ngay sau K0-13 |
