# Route Handler: `server-api`

Đây là hợp đồng cho K2-07, K4-05, K4-06 và K4-07. Luật quyền và realtime lấy từ `docs/design/permissions.md` và `docs/design/realtime.md`. Các route không thay thế RLS.

## Trạng thái triển khai

- Token LiveKit real và webhook `participant_left` trả `503`: token cũ và lệnh LiveKit hoàn tất muộn có thể giữ role host sau khi đổi quyền. Route cấp và kiểm tra `START_SHOT` đã nối với `RoomBus`; chữ ký hợp lệ không thay kiểm tra host hiện tại, membership và replay trong DB. Test hai browser qua LiveKit local và DB thật dùng token fixture tự ký, không kiểm tra route cấp token real.
- Kick, chuyển host và leave chỉ chạy với `REALTIME_ADAPTER=mock`; real trả `503`. Tạo room, join, xếp slot và PATCH room có route và RPC.
- Tạo, sửa và mở shared strip trả `503`; schema và ảnh export do client upload chưa chứng minh đầy đủ owner. Các route personal đã có.
- Migration mới đã áp vào Supabase local, chưa chạy cloud. Migration chặn ghi trực tiếp strip yêu cầu client dùng Route Handler thay vì ghi các bảng đó trực tiếp.

## Quy ước chung

- Trừ webhook và mở link, caller phải đăng nhập Supabase. Server xác thực user từ session hoặc access token Supabase; không nhận `user_id`, role hay quyền từ body làm danh tính. Webhook dùng chữ ký LiveKit; mở link cho phép cả user chưa đăng nhập.
- Body là JSON `Content-Type: application/json`, trừ webhook. ID là UUID; tên trường JSON dùng `camelCase`. Trường không ghi là tùy chọn thì bắt buộc; không nhận trường lạ. `null` chỉ hợp lệ khi bảng dưới ghi rõ.
- Thành công trả JSON, `Content-Type: application/json`. Lỗi trả `{"error":{"code":"...","message":"..."}}`; `message` không chứa secret, token hoặc thông tin nội bộ. Các response có token hoặc signed URL dùng `Cache-Control: no-store`; không ghi token, signed URL hoặc body webhook vào log.
- Mã chung: `400 INVALID_REQUEST` khi JSON, UUID hoặc trường không hợp lệ; `401 UNAUTHENTICATED` khi thiếu hoặc sai xác thực; `403 FORBIDDEN` khi không đủ quyền; `404 NOT_FOUND` khi tài nguyên không tồn tại hoặc cần che sự tồn tại; `409 CONFLICT` khi state không cho phép hoặc ghi trùng; `500 INTERNAL_ERROR` khi lỗi nội bộ; `503 SERVICE_UNAVAILABLE` khi DB, Storage hoặc LiveKit không sẵn sàng. Route không tiết lộ phân biệt token chia sẻ sai và strip không thể xem.
- Key secret Supabase chỉ ở server. Route dùng quyền vượt RLS phải tự kiểm tra quyền trên dữ liệu hiện tại trước từng thao tác; không tin dữ liệu client. Kiểm tra quyền và điều kiện ghi phải an toàn khi request đồng thời. Các thao tác nhiều dòng cần transaction ở DB. Migration mới đã thêm RPC tạo room, join room, tạo strip personal và tạo share token; chưa bao phủ mọi thao tác.
- DB và LiveKit/Storage không chung transaction. Nếu DB đã ghi mà dịch vụ ngoài lỗi, trả `503`; client tải lại state trước khi thử lại. Server phải hỗ trợ retry và đồng bộ lại tác dụng ngoài đã thiếu; không trả 2xx chỉ vì DB đã ghi. Không rollback DB giả định sau khi dịch vụ ngoài có thể đã nhận lệnh.
- `REALTIME_ADAPTER=mock`: bỏ qua LiveKit server API. Client vừa gọi thành công lệnh host gửi `ROOM_CHANGED` qua `RoomBus`; server không gửi event này. Client tải lại DB khi nhận event hoặc participant attribute đổi.

## Danh sách

| Mã | Method và path | Ai được gọi | Ghi DB | Dịch vụ ngoài |
|---|---|---|---|---|
| K2-07 | `POST /api/rooms/{roomId}/livekit-token` | host hoặc member chưa bị kick | Không | Ký LiveKit token |
| K4-02 | `PUT /api/rooms/{roomId}/shot-session` | host | chọn session và generation | Không |
| K4-02 | `POST /api/rooms/{roomId}/start-shot` | host | event và request ID | Không |
| K4-02 | `POST /api/rooms/{roomId}/start-shot/verify` | member chưa bị kick | claim event | Không |
| K4-05 | `POST /api/rooms` | user | `rooms`, `room_members` | Không |
| K4-05 | `POST /api/rooms/join` | user có link hoặc PIN | `room_members` | Không |
| K4-05 | `PATCH /api/rooms/{roomId}` | host | `rooms.status`, `frame_id`, `settings` | Không |
| K4-05 | `PUT /api/rooms/{roomId}/slots` | host | `room_members.slot_index` | Không |
| K4-05 | `POST /api/rooms/{roomId}/kick` | host | `room_members.kicked_at` | LiveKit `RemoveParticipant` |
| K4-05 | `POST /api/rooms/{roomId}/host` | host | `rooms.host_id` | LiveKit `UpdateParticipant` |
| K4-06 | `POST /api/sessions/{sessionId}/shots` | session member | `shots` | Kiểm tra Storage |
| K4-06 | `POST /api/sessions/{sessionId}/strips` | session member | `strips`, `strip_owners` | Không |
| K4-06 | `PATCH /api/strips/{stripId}` | session member hoặc creator theo `kind` | `strips.canvas_json`, `export_path` | Kiểm tra Storage nếu có export |
| K4-06 | `PATCH /api/strips/{stripId}/owner` | owner | visibility hoặc `hidden_at` của chính owner | Không |
| K4-06 | `POST /api/strips/{stripId}/share` | owner | `strips.share_token` | Không |
| K4-06 | `POST /api/strips/open` | người có token | Không | Storage signed URL |
| K4-07 | `POST /api/livekit/webhook` | LiveKit, có chữ ký hợp lệ | `rooms.host_id` khi host rời | LiveKit `ListParticipants`, `UpdateParticipant` |

## Room và LiveKit

Ba route chọn session, cấp và xác minh `START_SHOT` được mô tả tại `docs/modules/server-api/shot-events.md`.

### `POST /api/rooms/{roomId}/livekit-token`

Body `{}`. Server đọc room và membership hiện tại, yêu cầu `status = 'open'`, `host_id` khác null, membership của caller tồn tại và `kicked_at` null. Role là `host` khi caller trùng `rooms.host_id`, còn lại là `member`. Room `locked`, `editing` hoặc `ended` trả `409`; user bị kick hoặc không phải member trả `403`.

Với adapter real, ký token cho LiveKit room có tên là `roomId`, identity là UUID của user, participant attribute `role` theo DB, `canUpdateOwnMetadata = false`; chỉ cho join room đó, publish và subscribe. Trả `200 {"url":"<LiveKit URL>","token":"<JWT>","role":"host|member"}`. Không nhận identity hoặc role từ client. Token không thay thế kiểm tra quyền ở Route Handler. Adapter mock trả `200 {"url":null,"token":null,"role":"host|member"}` và không gọi LiveKit.

### `POST /api/rooms`

Body `{}`. Tạo `rooms` với host là caller, `status = 'open'`, PIN gồm đúng 6 chữ số được sinh ngẫu nhiên bằng nguồn mật mã; tạo membership của host. PIN giữ số 0 ở đầu và không trùng room chưa `ended`; thử lại khi trùng index. Tạo hai dòng trong cùng transaction. Trả `201 {"roomId":"<uuid>","pin":"<6 chữ số>"}`. Hết khả năng cấp PIN trả `503`.

### `POST /api/rooms/join`

Body đúng một trong `{"roomId":"<uuid>"}` hoặc `{"pin":"<6 chữ số>"}`. Link chứa `roomId`; server không yêu cầu thêm PIN khi dùng link. Chỉ room `open` nhận member. Membership đã bị kick không được tạo lại hoặc xoá dấu kick. Membership hợp lệ đã có thì trả thành công mà không đổi `created_at` hoặc slot. Với membership mới, ghi `room_members` của caller. Trả `200 {"roomId":"<uuid>"}`; room không tồn tại trả `404`, room không `open` trả `409`, bị kick trả `403`. Phải kiểm tra state và insert dưới cùng cơ chế đồng bộ DB để không join sau khi lock hoặc kick.

### `PATCH /api/rooms/{roomId}`

Body có ít nhất một trường `{"locked":true|false,"frameId":"<uuid>|null","settings":{...}}`. `locked=true` đổi `open` thành `locked`; `false` đổi `locked` thành `open`; giá trị đang có là no-op. Không dùng route này đổi `editing` hoặc `ended`; trả `409` ở các state đó. `frameId` phải là asset `frame` chưa xoá mà host được dùng, hoặc null để bỏ frame. `settings` là JSON object thay thế toàn bộ, không phải merge; kích thước tối đa 16 KiB khi mã hoá UTF-8. Server từ chối key `__proto__`, `constructor`, `prototype` ở mọi cấp và object lồng quá 16 cấp. Chỉ host hiện tại có membership chưa bị kick được gọi. Trả `200 {"roomId":"<uuid>","status":"open|locked","frameId":"<uuid>|null","settings":{...}}`.

### `PUT /api/rooms/{roomId}/slots`

Body `{"slots":[{"userId":"<uuid>","slotIndex":0}]}` là toàn bộ danh sách slot đã gán; `slotIndex` là số nguyên từ 0 và nhỏ hơn số slot của FrameManifest hiện tại. User phải là member chưa bị kick; không lặp user hoặc slot. Mảng rỗng bỏ mọi gán slot. Trong một transaction, xoá gán cũ rồi ghi danh sách mới sau khi kiểm tra frame và membership. Host hợp lệ gọi khi room chưa `ended`. Trả `200 {"slots":[{"userId":"<uuid>","slotIndex":0}]}`; thiếu frame hoặc state đổi trong lúc ghi trả `409`.

### `POST /api/rooms/{roomId}/kick`

Body `{"userId":"<uuid>"}`. Host hợp lệ kick member khác host, ghi `kicked_at` trước, sau đó gọi `RemoveParticipant` theo `roomId` và user ID. Member đã bị kick: giữ nguyên timestamp và vẫn thử loại participant nếu còn kết nối. Participant đã rời LiveKit được coi là đã loại. Trả `200 {"userId":"<uuid>","kicked":true}` sau khi hoàn tất; tự kick, target không phải member hoặc room đã `ended` trả `409`. Một token LiveKit đã cấp trước kick không tự bị thu hồi bởi thay đổi DB; việc chặn reconnect bằng token còn hạn cần cơ chế LiveKit phù hợp, không được coi `RemoveParticipant` hoặc kiểm tra lúc cấp token là bằng chứng đã thu hồi token.

### `POST /api/rooms/{roomId}/host`

Body `{"userId":"<uuid>"}`. Host hiện tại chuyển cho member khác chưa bị kick, đang kết nối LiveKit; adapter mock dùng membership hợp lệ. Kiểm tra host cũ và target, đổi `rooms.host_id` có điều kiện để hai lần chuyển đồng thời không ghi đè nhau. Đổi participant attribute `role` của host cũ thành `member` và host mới thành `host` qua `UpdateParticipant`; server không cho client tự đổi. Trả `200 {"hostId":"<uuid>"}` khi đã đồng bộ. Target không hợp lệ, không còn kết nối hoặc host đã đổi trả `409`. Khi gọi lại sau lỗi một phần, server đối chiếu DB và role LiveKit để hoàn tất, không cấp role `host` cho hai participant; trong lúc chưa đồng bộ không coi quyền `START_SHOT` đã an toàn.

## Shot và strip

Storage dùng bucket private `media`. Shot có path `sessions/{sessionId}/{round}/{userId}.jpg`; strip export có path `strips/{stripId}.png`. Client upload qua `StoragePort`, không gửi bytes qua các route này. Server không nhận path tuỳ ý từ client. Retry upload shot theo IndexedDB thuộc adapter Storage, không phải bằng chứng DB đã ghi.

### `POST /api/sessions/{sessionId}/shots`

Body `{"round":0}` với `round` là số nguyên không âm. Caller phải là session member hiện tại theo `is_session_member()`. Server dựng path từ session, round và identity; kiểm tra object JPEG đã có trong Storage trước khi tạo `shots` với `user_id` là caller. Trả `201 {"shotId":"<uuid>","storagePath":"<path>"}`. Cùng `(sessionId, round, userId)` và cùng path: trả `200` với shot hiện có; thiếu object hoặc state xung đột trả `409`. Route không xoá object nếu ghi DB lỗi; retry dùng lại path. Client gửi `SHOT_UPLOADED` sau khi DB xác nhận.

### `POST /api/sessions/{sessionId}/strips`

Body `{"kind":"shared|personal","canvasJson":{"version":1},"ownerIds":["<uuid>"]}`. `canvasJson` là object có `version`, theo format studio hỗ trợ. Caller là session member. Với `personal`, `ownerIds` phải chỉ có caller. Với `shared`, `ownerIds` không rỗng, không trùng, gồm đúng những người có mặt trong strip và đều là session member; server không được tự coi mọi room member là owner. Server kiểm tra quan hệ owner với shot được dùng khi có dữ liệu để xác minh; schema hiện chưa lưu quan hệ shot–strip, nên không thể chứng minh tập owner từ `canvas_json` chỉ bằng schema hiện tại. Không công bố quyền riêng tư shared an toàn nếu chưa có cách xác minh đáng tin cậy.

Tạo `strips` với `created_by` là caller, `export_path` và `share_token` null, cùng các dòng `strip_owners` mặc định `session`, trong một transaction. Trả `201 {"stripId":"<uuid>","ownerIds":["<uuid>"]}`. Khi chưa có transaction hoặc chưa xác minh được owner shared, không triển khai bằng cách bỏ qua kiểm tra; trả `503`.

### `PATCH /api/strips/{stripId}`

Body có ít nhất một trường `{"canvasJson":{"version":1},"exported":true}`. Với shared, caller là session member; với personal, caller là creator. `canvasJson` là object có `version`, thay toàn bộ canvas. `exported=true` xác nhận object PNG đã upload tại path chuẩn; server kiểm tra object tồn tại rồi ghi `export_path`. Không nhận `exported=false` hoặc path do client chọn. Trả `200 {"stripId":"<uuid>","canvasJson":{...},"exportPath":"<path>|null"}`; object chưa có trả `409`. Route không đảm bảo upload và DB ghi cùng transaction.

### `PATCH /api/strips/{stripId}/owner`

Body có ít nhất một trường `{"visibility":"private|session|friends|link","hidden":true|false}`. Chỉ sửa dòng `strip_owners` của caller; `hidden=true` ghi `hidden_at` thời điểm server, `false` đặt null. Ẩn khỏi gallery không đổi quyền xem của người khác. Trả `200 {"visibility":"<mức>","hidden":true|false}`. Đổi visibility có thể làm link hiện tại không còn dùng được; server kiểm tra lại mọi owner ở mỗi lần mở link.

### `POST /api/strips/{stripId}/share`

Body `{}`. Chỉ owner tạo link. Nếu chưa có `share_token`, sinh token ngẫu nhiên bằng nguồn mật mã, tối thiểu 256 bit entropy, lưu giá trị duy nhất; nếu đã có thì trả token hiện tại. Trả `200 {"shareToken":"<token>"}`. Tạo token không đồng nghĩa mọi người có link được xem: route mở link vẫn kiểm tra từng owner. Không trả token trong log hoặc URL request; client chuyển token cho người nhận qua link của giao diện.

### `POST /api/strips/open`

Body `{"shareToken":"<token>"}`. Token phải khớp `strips.share_token`, strip phải có ít nhất một owner và `export_path` đúng path chuẩn, object tồn tại. Với mỗi owner, viewer được owner đó cho phép nếu là chính owner đó; hoặc visibility là `session`, `friends`, `link` và viewer là session member; hoặc visibility là `friends`, `link` và viewer là bạn đã `accepted` của owner đó; hoặc visibility là `link` và token hợp lệ. Viewer chưa đăng nhập chỉ thoả nhánh `link`. Tất cả owner phải cho phép; không có ngoại lệ chỉ vì viewer là một owner. `hidden_at` không ảnh hưởng quyền xem.

Sau khi kiểm tra, tạo signed URL đọc object private, thời hạn 60 giây. Trả `200 {"url":"<signed URL>","expiresIn":60}`. Token sai, thiếu owner, thiếu export hoặc không được mọi owner cho phép đều trả `404 NOT_FOUND`; lỗi Storage trả `503`. Response không trả canvas, danh sách owner hoặc token. Signed URL đã phát còn dùng được đến hết hạn ngay cả khi visibility đổi; không hứa thu hồi tức thì.

Migration `20261127090234_enforce_strip_visibility.sql` sửa `can_view_strip()` và `strips_select` theo luật mọi owner; policy Storage dùng helper này. Migration đã áp vào Supabase local, chưa chạy cloud. Route open vẫn tự kiểm tra từng owner và chưa mở shared strip khi schema chưa xác minh được owner.

## Webhook LiveKit

### `POST /api/livekit/webhook`

Nhận raw body và header `Authorization` của LiveKit. Xác minh chữ ký và hash body bằng `WebhookReceiver` trước khi tin event; không parse rồi serialize lại để kiểm chữ ký. Không dùng session user cho webhook. Chữ ký thiếu hoặc sai trả `401 UNAUTHENTICATED`; body hợp lệ nhưng thiếu dữ liệu cần thiết trả `400 INVALID_REQUEST`. Event đã xác minh nhưng không phải `participant_left` trả `200 {"ok":true}`.

Với `participant_left`, lấy room name và participant identity theo quy ước UUID ở route token. Chỉ xử lý nếu identity vẫn là `rooms.host_id` và participant đó thực sự không còn trong danh sách participant hiện tại; event cũ, lặp, room không tồn tại hoặc host đã đổi là no-op `200`. Lấy participant đang kết nối từ LiveKit, đối chiếu `room_members.kicked_at` null, chọn member có `room_members.created_at` sớm nhất; hoà bằng `user_id` để xác định duy nhất. Chuyển `host_id` có điều kiện host cũ vẫn khớp, rồi cập nhật attribute `role` của host mới bằng `UpdateParticipant`. Nếu không còn member đang kết nối, đặt `host_id` null có điều kiện; không tự chọn member đã rời. Trả `200 {"ok":true}` sau khi hoàn tất; lỗi tạm thời trả `503` để LiveKit thử lại. Retry phải đồng bộ attribute còn thiếu ngay cả khi DB đã đổi, không bỏ qua chỉ vì host cũ không còn khớp. Không phát `ROOM_CHANGED` từ server.

`room_members` không có trạng thái hiện diện hoặc lịch sử session; `created_at` là thời điểm dòng membership được tạo, không chứng minh thời điểm vào lại. Danh sách LiveKit có thể đổi giữa lúc đọc và cập nhật. Phải kiểm tra lại target và điều kiện DB, xử lý retry; không hứa chọn đúng member còn trong room một cách nguyên tử giữa DB và LiveKit. Khi `host_id` null, schema cho phép nhưng chưa có luồng phục hồi host theo thiết kế; không tự cấp token host hoặc chuyển quyền cho user bất kỳ. Adapter mock không nhận webhook LiveKit; cần luồng hiện diện mock tương đương trước khi coi tự chuyển host là hoàn tất.

## Giới hạn triển khai cần xử lý

- Migration mới có RPC tạo room và membership, join room, tạo strip personal cùng owner và tạo share token. Xếp slot, tạo shared strip và các lệnh host còn cần transaction DB phù hợp. Không sửa migration đã push.
- Schema không lưu session member tại thời điểm chụp, quan hệ shot–strip hoặc `sessions.ended_at`. `is_session_member()` dùng membership room hiện tại; không thể xác minh đầy đủ owner của shared strip hay thời điểm bắt đầu retention theo session đã kết thúc chỉ từ schema hiện tại.
- Chuyển host và kick qua DB cùng LiveKit không có transaction chung. Retry và đối soát là bắt buộc; role cũ còn hiệu lực trong cửa sổ lỗi là rủi ro bảo mật, không che bằng response thành công.
- Migration RLS đã áp vào local, chưa chạy cloud. RLS mới không cho đọc strip chưa có owner, nên tạo strip và owner phải qua transaction.
