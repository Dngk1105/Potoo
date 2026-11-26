# BUILD-TRACK: `contracts` (Gói 3)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K3-01 | `core/contracts/` | [x] | `core/contracts/index.ts` | MVP đã qua kiểm chứng. Gói 4 và Gói 5 review trước khi merge |
| K3-02 | Mock `AuthPort` | — | | Bỏ: dùng Supabase local |
| K3-03 | Mock `RoomPort`, `RoomBus` | [x] | `core/adapters/mock/` | MVP dùng `BroadcastChannel` theo room |
| K3-04 | Mock `StoragePort` | — | | Bỏ: dùng Supabase local |
| K3-05 | Mock `MediaSource` | [x] | `core/adapters/mock/media-source.ts` | Video `.mp4` chạy lặp. Đã kiểm tra trên Chrome headless |
| K3-06 | Chọn adapter theo `.env` | [~] | `core/adapters/index.ts` | Đã kiểm chứng selector. Chờ Gói 4 cung cấp factory real để tích hợp |
| K3-07 | Feature flag | [x] | `core/config/index.ts` | Xác thực hai biến ở server. Mặc định `real` |
| K3-08 | Unit test cho mock | [x] | `core/adapters/mock/` | 21 test mock qua. Chrome headless qua cả realtime hai tab và media |

## 2. Cần làm tiếp

1. [ ] Gói 4 và Gói 5 review chữ ký MVP. Báo nhóm trước khi merge vào `dev`.
2. [x] Đồng bộ K3-01 đến K3-08 lên Google Sheet. K3-02 và K3-04 giữ trạng thái không áp dụng.
3. [ ] Tích hợp các factory real của Gói 4 rồi kiểm tra cấu hình từ server đến consumer của Gói 5.
4. [ ] Xác nhận CI của PR #8 qua với lockfile đã khôi phục từ `dev`.

## 3. Nhật ký phiên

### 2026-11-26 12:03 — Đồng bộ checklist Gói 3

**Người / agent:** Phú / Codex

Đã cập nhật hạng mục, ghi chú, DoD và đường dẫn của K3-01 đến K3-08 trong tab «Checklist khung».
K3-08 phụ thuộc K3-03 và K3-05. K3-06 đang làm, chờ factory real từ Gói 4.

**Kiểm chứng.** Google Drive đọc lại `A33:I40` và xác nhận cả 8 dòng khớp nội dung cập nhật.
Google Sheets hiển thị các ô đã sửa. K3-02 và K3-04 giữ «Thay đổi / Bỏ qua» và quy tắc dropdown hiện có.

### 2026-11-26 11:32 — Sửa `npm ci` của PR #8

**Người / agent:** Phú / Codex

Đã tái hiện `EUSAGE` do thiếu bốn mục `@emnapi` trên Ubuntu. `package.json` của PR trùng với `dev`, nên khôi phục
`package-lock.json` từ `dev` để bỏ diff lockfile của commit `48aa9d1`.

**Kiểm chứng.** Checkout sạch trên Ubuntu với Node `24.22.3` và npm `11.19.1` chạy `npm ci`, lint, typecheck,
kiểm tra định dạng và build thành công. Vitest qua 42/42 test trong 5 file.

### 2026-11-26 11:18 — Final review và bàn giao Gói 3

**Người / agent:** Phú / Codex

Đã rà public export, ranh giới import, SSR, quyền `START_SHOT`, cleanup của realtime và media, cùng selector và cấu hình server.
Cập nhật hướng dẫn bàn giao trong `README.md` của Gói 3 và mô tả phạm vi mock trong thiết kế contract. K3-06 vẫn `[~]`, chờ tích hợp thật.

**Kiểm chứng.** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run format:check`, `npm.cmd test`,
`npm.cmd run build` và `git diff --check` đều qua. Vitest có 42/42 test trong 5 file, gồm 21 test mock.
`git status` xác nhận nhánh `feat/contracts` đồng bộ với `origin/feat/contracts` và chưa có file stage.
`git diff --stat` liệt kê 12 file đã được Git theo dõi có thay đổi. Có thêm 6 file mới chưa stage.

**Kiểm tra PR.** Diff với `dev` còn thay đổi `package-lock.json` từ commit `48aa9d1`, gồm metadata của dependency tùy chọn,
trong khi `package.json` giữ nguyên. Gói 1 cần xác nhận thay đổi này và kết quả `npm ci` trong CI trước khi merge.
`.env.local` đã được ignore. Repo cũng ignore `env.download`. Harness và profile Chrome nằm ngoài repo.
Google Sheet chưa có kết nối trong phiên này.

### 2026-11-26 11:09 — Kiểm chứng mock và review Gói 3

**Người / agent:** Phú / Codex

Đã xác nhận mốc ban đầu 39 test qua trong 5 file. Sau khi bổ sung 3 test, bộ test có 42 test qua trong 5 file,
0 lỗi và 0 bỏ qua. Trong đó có 21 test trực tiếp cho các adapter mock.

| Yêu cầu | File test | Test đã có | Mức độ | Bổ sung trong phiên |
|---|---|---|---|---|
| `RoomPort` join, leave, identity, role, snapshot, subscription, publish và cleanup | `core/adapters/mock/realtime.test.ts` | Late join và leave, cập nhật role, hủy đăng ký và dọn nguồn state, giữ track của caller, cô lập room | Đạt contract hiện tại | Đổi room báo một snapshot mới. Nếu chuẩn bị room mới lỗi, room cũ vẫn hoạt động |
| `RoomBus` gửi nhận, metadata, quyền host và cô lập room | `core/adapters/mock/realtime.test.ts` | Đủ bốn event, sender tách khỏi payload, kiểm tra host hiện tại, chặn role tự khai báo, đổi host và unsubscribe | Đạt | Nhiều listener cùng event, hủy một listener và bỏ packet đã xếp hàng sau leave |
| `MediaSource` phát MP4 lặp, kích thước, frame rate, lỗi, vòng đời và SSR | `core/adapters/mock/media-source.test.ts` | Nguồn mẫu, loop, tham số, không truy cập thiết bị, lỗi phát, timeout, stream độc lập và khởi tạo lại sau `stop()` | Đạt | Lỗi vẽ frame sau khi stream đã trả về dọn timer, video và canvas. Test thành công dừng track trước khi kết thúc |
| Selector và feature flag | `core/adapters/selector.test.ts`, `core/config/index.test.ts` | Mặc định, giá trị sai, bốn tổ hợp, tạo theo nhu cầu, chung kết nối, thiếu factory real và cô lập instance | Đạt unit test | Factory real dùng dữ liệu test. K3-06 chờ tích hợp adapter real |

**Kiểm chứng.** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run format:check`, `npm.cmd test`,
`npm.cmd run build` và `git diff --check` đều qua. `git status` và `git diff --stat` xác nhận thay đổi nằm trong phạm vi
Gói 3 và giữ các thay đổi của phiên trước trong worktree.

**Trình duyệt.** Chrome headless chạy hai tab thật trên localhost. Cả hai tab nhận danh sách participant. Host gửi
`START_SHOT`, member nhận, quyền đổi theo role mới và peer còn lại nhận cập nhật khi member leave. Smoke test riêng cho
media xác nhận MP4 chạy lặp, preview đổi frame, dọn tài nguyên và khởi tạo lại. Unit test realtime dùng `BroadcastChannel`
trong Node, còn unit test media dùng Web API giả lập.

**Bàn giao.** Đã thêm hướng dẫn trong `README.md` của Gói 3. `RoomPort` hiện kết thúc publish qua `leave()`.
Gói 4 và Gói 5 còn review contract, ánh xạ event LiveKit, kiểm tra vòng đời stream và nối các factory real với consumer.
Google Sheet chưa đồng bộ vì phiên này chưa có kết nối.

### 2026-11-26 10:53 — Adapter selector và feature flag

**Người / agent:** Phú / Codex

| Việc | Kết quả |
|---|---|
| `core/config/index.ts`, `.env.example` | Server đọc `REALTIME_ADAPTER` và `MEDIA_ADAPTER`. Mỗi biến nhận `real` hoặc `mock`. Biến chưa khai báo mặc định `real`. Giá trị sai báo lỗi theo tên biến |
| `core/adapters/index.ts`, `core/adapters/selector.ts` | `createAdapterSelector()` tạo cặp `RoomPort` và `RoomBus` theo một chế độ chung, chọn `MediaSource` độc lập. Mỗi adapter được tạo ở lần gọi đầu tiên. Thiếu factory real thì báo lỗi |
| `core/config/index.test.ts`, `core/adapters/selector.test.ts`, `core/adapters/mock/realtime.test.ts` | Kiểm tra bốn tổ hợp, môi trường sai, thiếu factory, phạm vi instance và quyền `START_SHOT` sau khi đổi host |
| `docs/design/contracts.md`, `docs/design/environments.md`, `docs/modules/contracts/README.md` | Ghi cách chọn adapter và truyền cấu hình đã kiểm tra từ server sang client theo quy định về prefix `NEXT_PUBLIC_` |

**Kiểm chứng.** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run format:check`, `npm.cmd run build` và `git diff --check` đều qua.
`npm.cmd test` qua 39/39 test trong 5 file. Bộ test có 18 test mock realtime và media, 15 test selector và cấu hình, 6 test contract.

**Giới hạn MVP.** Unit test dùng factory real giả lập. Gói 4 cung cấp factory real, Gói 5 truyền cấu hình từ server và giữ một
selector trong mỗi phạm vi sử dụng. Booth vẫn giữ một stream, dừng track khi rời booth và để adapter dọn tài nguyên nội bộ.

### 2026-11-26 10:48 — Review contract và subscription participant

**Người / agent:** Phú / Codex

| Việc | Kết quả |
|---|---|
| Review K3-01 và vòng đời `MediaStream` | Gói 3 giữ các lựa chọn MVP. Booth dùng một stream cho preview, publish và xử lý frame. Gói 4 và Gói 5 review khi tích hợp |
| Thêm `RoomPort.onParticipantsChanged()` | Mock báo khi danh sách participant hoặc role thay đổi. UI đọc snapshot qua `participants()`. Mock nhận thay đổi role từ nguồn state của room |
| Đối chiếu cấu hình K3-06 | Đề xuất `NEXT_PUBLIC_REALTIME_ADAPTER` cho `RoomPort` và `RoomBus`, `NEXT_PUBLIC_MEDIA_ADAPTER` cho `MediaSource`. Thiếu biến thì dùng `real`. Giá trị ngoài `real` và `mock`, hoặc chọn `real` khi chưa có adapter, đều báo lỗi. `AuthPort` và `StoragePort` tiếp tục dùng Supabase |

**Kiểm chứng.** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run format:check` và `git diff --check` đều qua.
`npm.cmd test` qua 24/24 test trong 3 file, gồm 2 test mới cho membership, role và hủy đăng ký.

### 2026-11-26 10:27 — Mock `MediaSource`

**Người / agent:** Phú / Codex

| Việc | Trạng thái |
|---|---|
| Thêm `public/mock/booth.mp4`. Repo chưa có video mẫu, nên tạo MP4 H.264 tổng hợp tại chỗ, có hình chuyển động, dài khoảng 3 s và nặng 17.605 byte | [x] |
| Thêm `media-source.ts` và export `createMockMediaSource` qua hai file `index.ts` trong `core/adapters/`. Adapter dùng `HTMLVideoElement` phát MP4 lặp và canvas để lấy video track | [x] |
| Mỗi lần `getStream()` tạo một stream độc lập. Bên gọi dừng track. Adapter dừng timer, tạm dừng video và bỏ nguồn MP4 khi track kết thúc hoặc có lỗi | [x] |
| Thêm `media-source.test.ts` để kiểm tra import trên server, tham số video, khởi tạo, lỗi và vòng đời | [x] |

**Kiểm chứng.** `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run format:check` và `npm.cmd run build` qua.
`npm.cmd test` qua 22/22 test trong 3 file, gồm 11 test mới dùng Web API giả lập. Chrome headless dùng Web API thật để kiểm tra
video lặp, track `live`, preview qua `srcObject`, hai frame khác nhau, cleanup và khởi tạo lại.

**Giới hạn MVP.** Mặc định `640 × 360` px, 24 fps. Adapter hỗ trợ `width`, `height`, `frameRate` và chỉ trả video track.
Fixture phục vụ kiểm tra frame, preview và luồng shot. Effect cần khuôn mặt cần một nguồn video phù hợp.

### 2026-11-26 10:09 — Mock `RoomPort` và `RoomBus`

**Người / agent:** Phú / Codex

| Việc | Trạng thái |
|---|---|
| Export `createMockRealtime` qua `core/adapters/index.ts`. Một lần gọi tạo cặp `RoomPort` và `RoomBus` dùng chung kết nối | [x] |
| Đồng bộ participant khi join và leave. Mô phỏng `publishTrack` và giữ vòng đời track ở bên gọi | [x] |
| Gửi 4 event qua `BroadcastChannel`. Bên nhận tra host từ state của room và chặn `START_SHOT` từ member | [x] |

**Kiểm chứng.** `npm.cmd run lint` qua. `npm.cmd run typecheck` sinh type cho route và `tsc --noEmit` qua.
`npm.cmd run format:check` báo mọi file đúng định dạng. `npm.cmd test` qua 11/11 test trong 2 file, gồm 5 test mock dùng
`BroadcastChannel` trong Node. Phiên kiểm tra hai tab chưa chạy được trong trình duyệt headless. Chrome báo `Target crashed`.
Edge hết thời gian chờ.

### 2026-11-26 09:59 — Hoàn thành MVP K3-01

**Người / agent:** Phú / Codex

| Việc | Trạng thái |
|---|---|
| Export 5 port, 2 plugin và `FrameManifest` phiên bản `1` qua `core/contracts/index.ts` | [x] |
| Định nghĩa 4 event và metadata người gửi cho `RoomBus`. Adapter kiểm tra `START_SHOT` theo participant attribute `role` trước khi gọi callback | [x] |
| Kiểm tra chữ ký public, payload, metadata người gửi và unsubscribe bằng TypeScript | [x] |

**Kiểm chứng.** `npm.cmd run lint` qua. `npm.cmd run typecheck` sinh type cho route và `tsc --noEmit` qua.
`npm.cmd run format:check` báo mọi file đúng định dạng. `npm.cmd test` qua 6/6 test trong 1 file.

**Cần làm tiếp.** Gói 4 và Gói 5 review chữ ký MVP ở mục 4. Phiên này chưa kết nối Google Drive để cập nhật checklist.

### 2026-11-23 16:46 — Bản DRAFT K3-01

**Người / agent:** Phú / Codex

| Việc | Trạng thái |
|---|---|
| Export `FrameManifest`, `ParticipantRole` và `RoomEventPayloads` qua `core/contracts/index.ts` | [~] DRAFT |
| Thêm kiểm tra type cho ba export | [x] |

**Kiểm chứng:** `npm.cmd run lint`: qua. `npm.cmd run typecheck`: sinh type cho route và `tsc --noEmit` qua.
`npm.cmd run format:check`: qua. `npm.cmd test`: 3/3 test qua trong 1 file.

**Cần follow-up:** Gói 4 và Gói 5 trả lời câu hỏi ở mục 4 trước khi chốt chữ ký public.

### 2026-11-19: Tạo khung

**Người / agent:** Dũng / Claude

| Việc | Trạng thái |
|---|---|
| Tạo `docs/modules/contracts/` từ `_template/` | [x] |

**Kiểm chứng:** không có code.

**Cần follow-up:** người phụ trách Gói 3 điền mục 4.

## 4. Phụ thuộc và câu hỏi đang chờ

| Ngày | Nội dung | Chờ ai |
|---|---|---|
| 2026-11-26 | Gói 3 giữ các lựa chọn MVP của K3-01. Gói 4 và Gói 5 review chữ ký khi tích hợp | Gói 4, Gói 5 |
| 2026-11-26 | Gói 4 ánh xạ event participant của LiveKit vào `onParticipantsChanged()`. UI đọc lại `participants()` để lấy role mới | Gói 4, Gói 5 |
| 2026-11-26 | Gói 3 xác nhận booth sở hữu một stream và dừng track khi rời booth. Gói 4 và Gói 5 kiểm tra vòng đời này khi tích hợp | Gói 4, Gói 5 |
| 2026-11-26 | Tên biến đã chọn là `REALTIME_ADAPTER` và `MEDIA_ADAPTER` để đọc ở server. Còn tích hợp factory realtime và media real vào selector | Gói 4, Gói 5 |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
