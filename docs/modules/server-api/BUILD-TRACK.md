# BUILD-TRACK: `server-api` (Gói 4)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K2-07 | Route Handler cấp token LiveKit có `role` | [~] | `app/api/` | Bảo. Chuyển từ Gói 2; mới có logic xác định role |
| K4-01 | Real Supabase Auth | [~] | `core/adapters/real/` | Bảo |
| K4-02 | Real `RoomBus` bằng LiveKit data packet | [~] | `core/adapters/real/` | Bảo |
| K4-03 | Real `RoomPort` bằng LiveKit | [~] | `core/adapters/real/` | Bảo. Không có screen share |
| K4-04 | Real Supabase Storage | [~] | `core/adapters/real/` | Bảo. Upload lỗi lưu IndexedDB, đồng bộ lại |
| K4-05 | Route Handler lệnh của host | [~] | `app/api/` | Bảo. Kick, chuyển host và leave mới chạy mock |
| K4-06 | Route Handler shot, strip | [~] | `app/api/` | Bảo. Thêm mở strip bằng `share_token` |
| K4-07 | Webhook LiveKit | [~] | `app/api/` | Bảo. Mới có kiểm chữ ký; còn chuyển host và đăng ký URL webhook |
| K4-08 | Test tích hợp adapter real | [~] | | Bảo |

## 2. Cần làm tiếp

1. [ ] Bảo, Quân review chữ ký `core/contracts/` với Phú
2. [ ] Thêm việc cho real `MediaSource` (webcam) vào sheet

## 3. Nhật ký phiên

### 2026-11-27 23:44 +07:00: Kiểm chứng trước commit

**Người / agent:** người yêu cầu / Claude

Người làm yêu cầu commit và push lên `dev`. Các mã Gói 4 vẫn giữ `[~]`; token, kick, chuyển host và webhook LiveKit real chưa hoàn tất. Không cập nhật Google Sheet vì phiên không có công cụ ghi Sheet.

**Kiểm chứng:** `npm test`: 326 test qua, 4 integration test local bỏ qua mặc định. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` và `git diff --check` qua. `origin/dev` không có commit lệch so với đầu phiên.

### 2026-11-27 23:26 +07:00: Test `START_SHOT` local

**Người / agent:** người yêu cầu / Claude

Người làm chạy `node tests/start-shot-local-e2e.mjs`; kết quả `PASS` cho hai browser qua LiveKit local, Route Handler xác thực, Ed25519 và DB issue/claim. Test dùng token LiveKit fixture tự ký; không kiểm tra route cấp token real. Không có lỗi dọn dữ liệu trong output; kiểm tra DB local không còn user có tiền tố test. Chưa xác minh độc lập room test đã được xóa.

**Kiểm chứng:** output lệnh: `PASS: two browsers, LiveKit local, authenticated START_SHOT routes, Ed25519, DB issue and claim`. Truy vấn đếm user test local trả `0`. Không chạy test cloud.

**Còn chờ:** route token real, kick/chuyển host real và cơ chế thu hồi media; test cạnh tranh và trường hợp lỗi trên LiveKit thật; shared strip và các mục còn lại. Không dừng container do người làm khởi động.

### 2026-11-27 23:20 +07:00: Áp migration local

**Người / agent:** người yêu cầu / Claude

Người làm xác nhận đã sao lưu và cho phép áp migration local. `npx supabase migration up` áp 9 migration mới vào Supabase local; không reset hoặc chạy cloud. Đã chuẩn bị `tests/start-shot-local-e2e.mjs`, nhưng hệ thống quyền từ chối chạy vì chưa xác minh được phạm vi dọn dữ liệu; chưa tạo user hoặc room bởi test đó. Test dùng token fixture, không kiểm tra route cấp token real.

**Kiểm chứng:** `npx supabase migration list` xác nhận 9 version mới có trong lịch sử local. `node --check tests/start-shot-local-e2e.mjs` qua; test đầu cuối chưa chạy. `npm test`: 326 test qua, 4 integration test local bỏ qua mặc định; `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check` và `git diff --check` qua.

**Cần follow-up:** kiểm tra và cho phép chạy test với hai user và room test, chỉ dọn dữ liệu do test tạo; kiểm tra `START_SHOT` qua LiveKit, Route Handler và DB thật. Token real vẫn trả `503`; migration chưa chạy cloud.

### 2026-11-27 23:10 +07:00: Test LiveKit local

**Người / agent:** người yêu cầu / Claude

Người làm khởi động LiveKit local. Hai browser Edge headless kết nối LiveKit thật qua `RoomPort`, trao đổi `READY` và `ROOM_CHANGED`, publish camera giả và phát remote video qua `attach`/`detach`. Test dùng token fixture tự ký cho room test; callback xác minh `START_SHOT` là mock, không đi qua Route Handler hoặc DB.

**Kiểm chứng:** `node tests/livekit-browser.mjs` qua hai participant và remote video. `npm test`: 326 test qua, 4 integration test local bỏ qua mặc định; `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua. `db:check` không kiểm đầy đủ migration chưa commit.

**Còn chờ:** token real và xác minh `START_SHOT` end-to-end; kiểm tra camera/mic thật và hai máy. Chưa áp migration hoặc chạy cloud. Không dừng container do người làm khởi động.

### 2026-11-27 22:41 +07:00: Tiếp tục việc không chờ

**Người / agent:** người yêu cầu / Claude

Đã thêm tải lại public key khi gặp key ID mới, tối đa một lần mỗi 5 giây. Nếu tải lại lỗi, adapter giữ key đang cache đến khi hết hạn và chờ 5 giây trước lần tải mới; event có key không khớp vẫn bị từ chối. Hệ thống quyền từ chối tác vụ bổ sung dọn claim vì thao tác trên dữ liệu dùng chung; chưa triển khai tác vụ đó.

**Kiểm chứng:** `npm test`: 326 test qua, 4 integration test local bỏ qua mặc định. Test Edge headless kiểm tra xoay Ed25519 và preverify qua với key test. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua; `db:check` không kiểm đầy đủ migration chưa commit.

**Còn chờ:** test LiveKit thật và claim retry nhiều kết nối, thu hồi media sau kick, lifecycle session, dọn event và shared strip. Key và migration chưa áp dụng trên cloud; Google Sheet chưa đồng bộ.

### 2026-11-27 20:35 +07:00: Giảm packet giả và retry claim

**Người / agent:** người yêu cầu / Claude

- Thêm `claimRequestId`: retry sau lỗi mạng dùng cùng ID, server chỉ trả lại claim khi state và quyền còn hợp lệ. Request ID khác cho cùng event và user bị từ chối; route cũ vẫn dùng được claim một lần.
- Thêm chữ ký Ed25519 ngoài HMAC. Client kiểm chữ ký bằng public key từ route cùng origin trước khi xếp HTTP claim; server vẫn kiểm Ed25519, HMAC, state và replay. Không fallback sang envelope cũ.
- Tách hàng đợi kiểm chữ ký khỏi hàng đợi claim để packet sai chữ ký đã kiểm không giữ slot phía sau một claim chậm. Giới hạn này giảm tải, không bảo đảm chống flood.
- Dùng chung claim đang chạy cho cùng envelope; bỏ cache khi claim lỗi để packet có thể được thử lại. Sửa race giữa claim local của host và packet phát lại.

**Kiểm chứng:** `npm test`: 323 test qua, 4 integration test local bỏ qua mặc định. Test SQL claim retry, replay và kick chạy cùng migration local rồi rollback. Test Edge headless xác minh Ed25519 và preverify của adapter qua với key test; chưa kiểm thử LiveKit thật hoặc browser khác. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua; `db:check` không kiểm đầy đủ migration chưa commit.

**Còn chờ:** kiểm thử claim retry với nhiều kết nối và LiveKit thật; hoàn tất thu hồi quyền media, lifecycle session, dọn event và shared strip. Hai signing key chưa được cấu hình; migration chưa áp dụng lâu dài hoặc chạy cloud. Xoay Ed25519 có thể khiến client từ chối event đến 60 giây do cache public key. Google Sheet chưa được cập nhật.

### 2026-11-27 19:38 +07:00: Nối `START_SHOT`

**Người / agent:** người yêu cầu / Claude

Đã nối route chọn session, cấp và claim event với `RoomBus` real qua chữ ký HMAC và transport HTTP cùng origin. Payload có `sessionId` và `requestId`; mock được cập nhật theo contract. Nhánh LiveKit token, kick và chuyển host real vẫn đóng. Đã thêm migration cho phép cấp lại round khi event cũ hết hạn hoặc stale và chưa có ai claim.

**Kiểm chứng:** `npm test`: 304 test qua, 4 integration test local bỏ qua mặc định; test nối route và `RoomBus` dùng DB và LiveKit giả. SQL migration và test event chạy local trong transaction rồi rollback. Test PostgreSQL hai kết nối trong database tạm qua: một issue thành công, một conflict; một claim thành công, một replay; claim sau kick bị từ chối. Database test đã được xóa. Lần chạy lại test database tạm bị hệ thống quyền từ chối. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua; `db:check` không kiểm đầy đủ migration chưa commit.

**Cần follow-up:** kiểm thử LiveKit thật; xử lý thu hồi quyền media sau kick, lifecycle session và dọn event. Packet giả có thể làm đầy hàng đợi xác minh; claim thành công nhưng response mất có thể khiến một máy không countdown. Cần cấp `START_SHOT_SIGNING_KEY` theo từng môi trường trước khi dùng; chưa cấu hình key hoặc migration trên cloud. Google Sheet chưa được cập nhật.

### 2026-11-27 19:09 +07:00: Bảo vệ `START_SHOT` real

**Người / agent:** người yêu cầu / Claude

Adapter real từ chối gửi và nhận `START_SHOT` khi chưa có xác thực server; role từ token cũ không đủ để nhận event. Mock giữ hành vi hiện tại. Đã thêm migration và test SQL cho chọn session, cấp event và claim chống replay; chưa nối các RPC với Route Handler hoặc `RoomBus`. Chưa kiểm thử nhiều transaction đồng thời; lifecycle session và dọn dữ liệu event còn thiếu.

**Kiểm chứng:** `npm test`: 258 test qua, 4 integration test local bỏ qua mặc định. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua. Test SQL event chạy cùng migration local rồi rollback và qua; chưa kiểm thử nhiều kết nối. Lần ghép test đầu lỗi khiến hai user test ghi ngoài transaction; đã xóa đúng hai user và kiểm tra không còn. `db:check` không kiểm đầy đủ migration chưa commit. Không kiểm thử LiveKit thật.

**Cần follow-up:** kiểm thử transaction event với nhiều kết nối, hoàn tất lifecycle session và dọn event; nối RPC với route và adapter; thiết kế thu hồi media khi kick. Token real và webhook `participant_left` vẫn trả `503`.

### 2026-11-27 18:50 +07:00: Tiếp tục việc còn chờ

**Người / agent:** người yêu cầu / Claude

- K4-05: PATCH room nhận `settings` là JSON object có giới hạn, kiểm tra key và độ sâu; migration mới thay RPC, không sửa migration cũ.
- K4-04: kiểm tra queue IndexedDB qua reload và đổi user trên Edge headless. Test cũng kiểm tra object trùng khác bytes không bị xoá. Upload, signed URL và retry object trùng đã kiểm tra với Supabase local.
- K4-03: bổ sung `attach` và `detach` cho remote track để adaptive stream theo dõi media element. Chưa kiểm tra kết nối LiveKit thật.
- K4-01: kiểm tra callback xác nhận email bằng token của Supabase local. User và dữ liệu test được dọn sau test.
- K2-07, K4-07: người làm cho phép chuyển `START_SHOT` sang event do server xác thực. Đã thêm helper ký và kiểm chữ ký; chưa nối vào route hoặc `RoomBus`, chưa có transaction kiểm host hiện tại và chống replay. Adapter real chặn gửi và nhận `START_SHOT`; token real và webhook `participant_left` vẫn trả `503`: LiveKit self-hosted không thu hồi token đã cấp.
- K4-06: shared strip vẫn chặn vì chưa xác minh được owner trong ảnh export.

**Kiểm chứng:** test API `settings` 9/9 qua; test SQL cùng các migration qua và rollback. Test Edge headless 9/9 qua, nhưng Storage và Auth trong harness là mock. Test xác nhận email local và test Storage local mỗi test 1/1 qua; test Storage kiểm cả retry khi object trùng và dọn dữ liệu test. `npm test`: 258 test qua, 4 integration test local bỏ qua mặc định. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua. `db:check` không kiểm đầy đủ migration chưa commit.

**Còn chờ:** nối event đã ký với route, DB và `RoomBus`; giải quyết thu hồi quyền LiveKit và đối soát; Google OAuth thật, LiveKit thật, provenance shared strip và integration test staging. Migration chưa áp dụng lâu dài hoặc chạy cloud; Google Sheet chưa được cập nhật.

### 2026-11-27 16:46 +07:00: Tiếp tục Gói 4

**Người / agent:** người yêu cầu / Claude

Người làm chuyển K4-01 và K4-04 sang Bảo; cho phép sửa phần phụ thuộc gói 1, 3, 5 và policy ghi strip để tích hợp. Chưa cập nhật Google Sheet vì phiên không có công cụ ghi sheet.

- K4-01: thêm callback OAuth và xác nhận email, proxy refresh session. Test Supabase local tạo user tạm rồi xoá qua; chưa kiểm tra Google hoặc email confirmation trên cloud.
- K4-04: thêm queue IndexedDB, phân biệt `uploaded` và `queued`, retry theo user và so bytes khi object đã tồn tại. Test queue dùng IndexedDB giả lập; chưa kiểm chứng qua reload trình duyệt và consumer thật.
- K4-02, K4-03: export factory real, bổ sung snapshot remote track và test selector. Chưa kết nối LiveKit thật.
- K4-05: thêm PATCH room, slots, kick, chuyển host, leave. Kick, chuyển host, leave chỉ chạy ở mock; real trả `503`. `settings` hiện chỉ nhận object rỗng.
- K2-07, K4-07: rà an toàn phát hiện token cũ có thể khôi phục role host, và LiveKit update có thể hoàn tất sau khi lease hết hạn. Token real và webhook `participant_left` trả `503` để không cấp quyền sai.
- K4-06: shared strip vẫn trả `503`; schema và PNG do client upload không chứng minh được các owner xuất hiện. Migration mới chặn client ghi trực tiếp `strips` và thêm owner ngoài Route Handler.
- Migration mới đã chạy cùng test SQL trong transaction local rồi rollback; chưa áp dụng lâu dài hoặc chạy cloud. Test RLS chặn ghi strip trực tiếp qua local và rollback.

**Kiểm chứng:** `npm test`: 253 test qua, 2 integration test local bỏ qua mặc định. Test Auth local riêng qua và xoá user tạm. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua. Test queue dùng IndexedDB giả lập; chưa kiểm tra LiveKit thật. `db:check` không kiểm đầy đủ file migration chưa commit.

**Cần follow-up:** thiết kế thu hồi quyền LiveKit và đối soát an toàn cho cả Cloud và local; hoàn tất shared strip có provenance; kiểm chứng IndexedDB trên trình duyệt, Google OAuth và test tích hợp staging. Test và áp migration sau khi có phép; báo Gói 3 về public export và contract đã đổi.

### 2026-11-27 15:52 +07:00: Việc của Bảo

**Người / agent:** người yêu cầu / Claude

- Người làm chọn luật xem strip theo thiết kế, cho phép tạo migration transaction và sửa RLS room, strip. Migration cũ giữ nguyên; không chạy cloud.
- K2-07: thêm route kiểm tra membership và role cho mock; real còn trả `503`, chưa cấp token.
- K4-02, K4-03: bổ sung cleanup track và unit test. Hệ thống quyền từ chối chạy container LiveKit dù người làm cho phép; chưa kiểm tra server thật.
- K4-05: thêm route tạo room và join, cùng RPC transaction. PATCH room, slots, kick và chuyển host chưa có. RLS host vẫn cho update `room_members` trực tiếp; chưa coi cơ chế kick an toàn.
- K4-06: thêm route shot, strip personal, owner, share token và open; shared strip còn trả `503` vì schema chưa xác minh được owner. Migration mới tạo strip personal và share token bằng transaction. Test SQL local đã rollback.
- K4-07: webhook kiểm chữ ký; `participant_left` còn trả `503`, chưa chuyển host.
- K4-08: test unit và SQL local qua; chưa có integration test LiveKit thật hoặc lịch chạy staging.
- Migration RLS strip được test trong transaction local rồi rollback. Migration room bỏ policy tự insert và xoá membership; chưa có route leave thay thế. Chưa áp dụng migration lâu dài.

**Kiểm chứng:** `npm test`: 170 test qua, 1 test Auth local bỏ qua mặc định; test Auth local đã chạy riêng và qua ở phiên trước. Test SQL tạo room/join, RLS strip và strip personal chạy local, rollback. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run db:check`, `npm run build` và `git diff --check` qua. `db:check` không kiểm đầy đủ migration chưa commit. Không có test LiveKit thật hoặc chạy migration cloud.

**Cần follow-up:** hoàn tất route, đối soát DB–LiveKit và provenance shared strip; xử lý RLS host update membership, route leave và test tích hợp. Chưa cập nhật Google Sheet vì phiên không có công cụ ghi sheet.

### 2026-11-27 15:19 +07:00: Tiếp tục Gói 4

**Người / agent:** người yêu cầu / Claude

- K4-01: thêm `signUp`, helper Supabase SSR và test. Người làm xác nhận đăng ký có thể cần xác nhận email, cho phép sửa `core/contracts/` và `docs/design/contracts.md`. Còn nối OAuth callback, refresh session và kiểm tra Google thật.
- K2-07: thêm logic xác định role từ room và membership; chưa có Route Handler cấp token.
- K4-07: thêm hàm kiểm chữ ký webhook; chưa có Route Handler hoặc chuyển host.
- K4-04: bổ sung xử lý lỗi và kiểm signed URL; chưa có IndexedDB retry.
- K4-02, K4-03: chưa kiểm thử LiveKit thật. Người làm cho phép container tạm nhưng hệ thống quyền từ chối chạy image.

**Kiểm chứng:** `npm test`: 99 test qua, 1 test Auth local bỏ qua mặc định. Chạy riêng test Auth local với tài khoản tạm: 1/1 qua, tài khoản đã xóa. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` và `git diff --check` qua. Chưa kiểm tra xác nhận email hoặc Google trên cloud.

**Cần follow-up:** báo nhóm thay đổi `core/contracts/` trước merge; chốt Route Handler và retry theo mục 4. Chưa cập nhật Google Sheet vì phiên không có công cụ ghi sheet.

### 2026-11-27 15:01 +07:00: Adapter real và `can()`

**Người / agent:** người yêu cầu / Claude

- K4-01: thêm `AuthPort` dùng Supabase client do caller truyền vào. Chưa nối SSR, OAuth callback hoặc kiểm tra đăng nhập thật; contract chưa có đăng ký.
- K4-02 và K4-03: thêm factory `RoomPort` và `RoomBus` dùng chung LiveKit, bật adaptive stream và dynacast. Token do caller cung cấp; chưa kết nối LiveKit thật hoặc tích hợp selector.
- K4-04: thêm upload, signed URL và remove qua Supabase Storage. Chưa có hàng đợi IndexedDB và đồng bộ shot khi có mạng.
- Thêm một phần `can()` và unit test. Chưa thêm các quyền phụ thuộc luật xem strip vì SQL và thiết kế lệch nhau.
- Cài SDK Supabase và LiveKit. Chưa cập nhật Google Sheet vì phiên không có công cụ ghi sheet.

**Kiểm chứng:** `npm test`: 82/82 test qua; test adapter dùng SDK giả. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` và `git diff --check` qua. Chưa chạy integration test với Supabase hoặc LiveKit thật.

**Cần follow-up:** hoàn tất K4-01 đến K4-04 và K4-08, chốt API cho K2-07 và K4-05 đến K4-07. Gói 2 và nhóm xác nhận luật xem strip tại mục 4.

### 2026-11-27 14:41 +07:00: Real `MediaSource`

**Người / agent:** người yêu cầu / Claude

Đã thêm factory webcam cho `MediaSource`. Factory dùng `getUserMedia`, mặc định chỉ bật video, chuyển nguyên constraints và lỗi cho caller. Chưa tích hợp vào selector của Gói 3.

**Kiểm chứng:** `npm test -- core/adapters/real/media-source.test.ts`: 3/3 test qua. `npm test`: 45/45 test qua. `npm run lint`, `npm run typecheck`, `npm run format:check` và `git diff --check` qua. Chưa kiểm tra webcam thật trên trình duyệt.

**Cần follow-up:** thêm mã việc `MediaSource` trên sheet; Gói 3 tích hợp factory. Các Route Handler còn chờ đường dẫn và đặc tả tại mục 4. Chưa cập nhật Google Sheet vì phiên không có công cụ ghi sheet.

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/server-api/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 4 điền `api.md` và mục 4.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-19 | Real `MediaSource` (webcam) chưa có mã việc trên sheet | Phú, Dũng |
| 2026-11-19 | Đường dẫn các Route Handler | Bảo |
| 2026-11-19 | `core/contracts/` | Gói 3 |
| 2026-11-27 | Thiết kế yêu cầu mọi owner cho phép xem strip; `can_view_strip()` cho mọi owner xem ngay. `strips_select` còn cho creator là session member xem | Gói 2, cả nhóm |
| 2026-11-27 | Xác định trạng thái upload shot đã lưu IndexedDB, retry và cách giới hạn theo user khi đổi session | Phú, Gói 3 |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
