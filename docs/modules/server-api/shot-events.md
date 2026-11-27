# Transaction `START_SHOT`

## Trạng thái

Thiết kế dành cho Gói 4. Route Handler và `RoomBus` đã được nối; token LiveKit real vẫn fail closed. Luồng này không dùng participant attribute `role` làm bằng chứng cấp quyền.

## Giao diện DB

Server xác thực identity trước khi gọi RPC bằng `service_role`. Client không được tự chọn identity. DB không giữ secret hoặc ký HMAC. Server ký payload do DB cấp bằng helper riêng; khi nhận, server kiểm chữ ký và gọi claim trước khi cho phép countdown. Không tin `role` trong LiveKit để thay claim.

- Host chọn session đã bắt đầu và thuộc room bằng `k407_select_shot_session`; truyền `null` để bỏ chọn. Không tự chọn session mới nhất.
- `k407_issue_start_shot` kiểm host, membership, room `open`, session được chọn và input dưới transaction. Request giống nhau trả event cũ nếu còn hợp lệ; cùng request khác payload hoặc round đang có event hợp lệ trả conflict. Event có hạn 30 giây theo đồng hồ DB. Event đã hết hạn hoặc state đã đổi chỉ được thay khi chưa có user nào claim; nếu đã claim thì không tự mở lại round.
- `k407_claim_start_shot_v2` kiểm host, generation, session, hạn và membership hiện tại; mỗi user chỉ có một claim cho mỗi event. Cùng `claimRequestId` được retry khi response bị mất; request khác cho cùng user và event bị từ chối. Một claim đã thành công không thể huỷ countdown đã bắt đầu trên máy nhận.
- Mọi thay đổi host, status, membership hoặc session liên quan làm tăng generation; đổi A → B → A không phục hồi event cũ. Trigger chạy cả khi các bảng hiện tại được ghi trực tiếp. Xung đột khoá hoặc deadlock làm transaction lỗi, không bỏ qua kiểm tra; server phải xử lý lỗi và chỉ retry có giới hạn.
- Bảng state, event và claim bật RLS không có policy cho client. Chỉ `service_role` được gọi các RPC; không cấp quyền trực tiếp lên các bảng này. Các thao tác quản trị vô hiệu hoá trigger hoặc sửa bảng bằng quyền owner nằm ngoài ranh giới tin cậy.

Các RPC trả JSON có `code`. Các mã gồm `OK`, `INVALID_REQUEST`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `STALE`, `EXPIRED` và `REPLAY`. UUID sai cú pháp bị PostgreSQL từ chối trước khi vào hàm. Khi issue thành công, server bỏ `code` trước khi truyền payload vào helper HMAC, vì helper không nhận trường lạ. Khi claim, server phải so sánh mọi trường trong payload đã xác minh với dữ liệu DB trả về; không được chỉ tin `eventId`. Retry cùng `claimRequestId` chỉ trả thành công khi event và quyền vẫn hợp lệ. RPC dùng đồng hồ DB cho thời hạn; server và DB cần đồng bộ đồng hồ để helper kiểm tra hạn nhất quán.

## Route và `RoomBus`

- `PUT /api/rooms/{roomId}/shot-session` nhận `{ "sessionId": "<uuid>|null" }`; host chọn hoặc bỏ chọn session đã bắt đầu. Server xác thực user, không nhận identity từ body.
- `POST /api/rooms/{roomId}/start-shot` nhận `{ "sessionId", "requestId", "round", "delayMs" }`, gọi RPC cấp event rồi trả `{ "envelope": "<chữ ký>" }`. Envelope bản 2 gồm key ID, HMAC envelope và chữ ký Ed25519. Caller giữ `requestId` khi retry. Chỉ host còn quyền được cấp event.
- `POST /api/rooms/{roomId}/start-shot/verify` nhận `{ "envelope", "claimRequestId" }`, xác minh HMAC, claim event qua DB và so sánh toàn bộ payload với dữ liệu đã claim. Response trả `{ "payload": { "sessionId", "requestId", "round", "delayMs" }, "sender": { "identity", "role": "host" } }`; lỗi, claim khác đã tồn tại hoặc state đã đổi không được dispatch. Client retry khi lỗi mạng với cùng `claimRequestId`.
- `RoomBus` real phát envelope qua reliable data packet. Client xác minh Ed25519 trước khi xếp vào hàng đợi HTTP claim; client không lấy public key từ packet và không fallback sang envelope bản 1. Client tự claim local vì LiveKit không phát packet về người gửi; các client khác claim khi nhận. Verify lỗi thì không countdown; verify hoàn thành sau khi leave hoặc đổi room thì bỏ kết quả. Một user chỉ claim một lần cho mỗi event, kể cả nhiều tab.
- Client tạo `createStartShotHttp()`, gọi `selectSession` trước round đầu, rồi truyền `issueStartShot`, `preverifyStartShot` và `verifyStartShot` vào factory realtime. Caller tạo `requestId` riêng cho mỗi round và giữ nguyên khi retry. Transport dùng cookie cùng origin; caller dùng bearer token phải cung cấp `fetch` có header phù hợp.
- HMAC dùng `START_SHOT_SIGNING_KEY` phía server; giá trị là 32 byte ngẫu nhiên mã hoá base64url. Ed25519 dùng `START_SHOT_ED25519_PRIVATE_KEY`, là PKCS#8 DER mã hoá base64url. `GET /api/start-shot-public-key` trả public key SPKI DER và key ID sau xác thực; client chỉ tin key từ route cùng origin. Hai key tách riêng cho mỗi môi trường. Thiếu hoặc sai key thì route trả `503`, không fallback sang participant attribute. Response và token không ghi log, dùng `Cache-Control: no-store`.
- Key ID là 16 ký tự đầu của SHA-256 public key mã hoá base64url. Server ký bytes `potoo:start-shot:v2:<keyId>:<HMAC-envelope-base64url>`. Envelope dạng `2.<keyId>.<HMAC-envelope-base64url>.<signature-base64url>`. Client cache public key tối đa 60 giây. Khi gặp key ID khác, client thử tải lại từ cùng origin không quá một lần mỗi 5 giây; event vẫn bị từ chối nếu key không khớp. Nếu tải lại lỗi, client giữ key đã cache đến khi hết hạn và chờ 5 giây trước lần tải mới; server vẫn kiểm tra chữ ký và quyền hiện tại. Khi xoay key, event có thể bị từ chối trong khoảng chuyển tiếp; không hứa tương thích giữa hai lần deploy.
- Mock tiếp tục kiểm tra role từ state giả lập và không cung cấp bảo đảm bảo mật. Token, kick, chuyển host và webhook real vẫn đóng; chữ ký event không thu hồi quyền media.

## Giới hạn

Session hiện chưa có lifecycle hoàn chỉnh. Chọn session là thao tác chủ động, không chứng minh session đã kết thúc hay tạo lifecycle mới. Event được lưu để chống replay và idempotency; cần chính sách dọn dữ liệu trước khi vận hành lâu dài. Không dọn event trước khi đã xử lý khả năng retry và trùng session/round. Route và `RoomBus` đã qua test hai browser với LiveKit và Supabase local thật; test dùng token LiveKit fixture tự ký, không kiểm tra route cấp token real. Retry cùng `claimRequestId` giảm lỗi khi response bị mất, nhưng không bảo đảm mỗi máy countdown hoặc exactly-once khi client đóng hay mất mạng lâu. Ed25519 giúp loại packet sai chữ ký trước HTTP claim, nhưng không bảo đảm chống flood hoặc ngăn packet hợp lệ bị phát lại trên mạng.
