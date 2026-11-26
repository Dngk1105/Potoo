# Gói 4: Server API và adapter real

Người phụ trách: Bảo; Phú làm K4-01, K4-04. Mã checklist: `K2-07`, `K4-01` đến `K4-08`.

| | |
|---|---|
| Tiến độ | [`BUILD-TRACK.md`](BUILD-TRACK.md) |
| Route Handler | [`api.md`](api.md) |
| Thiết kế liên quan | `docs/design/realtime.md`, `docs/design/permissions.md`, `docs/design/contracts.md`, `docs/design/environments.md` (mục 5) |

## Việc

1. Viết bảng luật `can()` khớp với hàm SQL của Gói 2.
2. Viết Route Handler cấp token LiveKit có attribute `role`.
3. Viết Route Handler lệnh của host: tạo room (PIN 6 số), vào room, lock, kick, đổi frame, xếp slot, chuyển host.
4. Viết Route Handler nhận webhook LiveKit `participant_left` để chuyển host.
5. Viết adapter real: Supabase Auth, Supabase Storage (kèm hàng đợi upload IndexedDB), LiveKit `RoomPort`, LiveKit `RoomBus`, webcam `MediaSource`.

## Ràng buộc đã chốt

| Ràng buộc | Nguồn |
|---|---|
| Token cấp với `canUpdateOwnMetadata = false`; chỉ server đổi attribute bằng `UpdateParticipant` | `realtime.md` mục 2 |
| Không cấp token khi `kicked_at` khác null hoặc room đang lock | `realtime.md` mục 2 |
| Kick: ghi `kicked_at`, gọi `RemoveParticipant` | `realtime.md` mục 3 |
| Server không gửi `ROOM_CHANGED`; client vừa gọi lệnh thành công tự gửi qua `RoomBus` | `realtime.md` mục 3 |
| Room dùng mock: Route Handler bỏ qua lời gọi LiveKit server API | `contracts.md` mục 2 |
| Người nhận chỉ chấp nhận `START_SHOT` từ participant có role `host` | `realtime.md` mục 4 |
| Strip mức `link` mở qua Route Handler kiểm tra `share_token`, trả signed URL | `permissions.md` mục 2 |
| Key secret Supabase và `LIVEKIT_API_SECRET` chỉ dùng trong Route Handler | `environments.md` mục 5 |
| `livekit-server --dev` ở local có cùng server API, gọi webhook về `localhost` được | `realtime.md` mục 3 |

## Sở hữu

| File, thư mục | Ghi chú |
|---|---|
| `app/api/` | Route Handler |
| `core/auth/` | Bảng luật `can()` |
| `core/adapters/real/` | Adapter real |

## Export qua `index.ts`

| Tên | Loại (component, hook, hàm) | Dùng bởi |
|---|---|---|
| `can()` | Hàm | Gói 5, mọi module có nút theo quyền |
| Adapter real 5 port | Class hoặc hàm | `core/adapters/index.ts` |

## Cần từ ai

| Cần | Từ | Để làm |
|---|---|---|
| `core/contracts/` | Gói 3 | Mọi adapter real |
| Type từ DB, hàm SQL | Gói 2 | Route Handler, `can()` |
| Biến môi trường Supabase, LiveKit | Gói 1 | Chạy trên staging |
