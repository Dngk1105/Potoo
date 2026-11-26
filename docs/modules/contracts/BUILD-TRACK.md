# BUILD-TRACK: `contracts` (Gói 3)

**Quy ước:** `[ ]` chưa · `[~]` đang làm · `[x]` xong · `[!]` cần sửa lại (docs và code lệch nhau) · `—` không áp dụng

Nguồn mã việc: Google Sheet "Checklist khung". Sheet và file này lệch nhau thì file này đúng, rồi sửa sheet.

## 1. Trạng thái

| Mã | Việc | Trạng thái | File | Ghi chú |
|---|---|---|---|---|
| K3-01 | `core/contracts/` | [x] | `core/contracts/index.ts` | MVP đã qua kiểm chứng. Gói 4 và Gói 5 review trước khi merge |
| K3-02 | Mock `AuthPort` | — | | Bỏ: dùng Supabase local |
| K3-03 | Mock `RoomPort`, `RoomBus` | [x] | `core/adapters/mock/` | MVP dùng `BroadcastChannel` theo room. Sheet ghi `core/ports/mock/` |
| K3-04 | Mock `StoragePort` | — | | Bỏ: dùng Supabase local |
| K3-05 | Mock `MediaSource` | [ ] | `core/adapters/mock/` | |
| K3-06 | Chọn adapter theo `.env` | [ ] | `core/adapters/index.ts` | Chọn riêng từng port |
| K3-07 | Feature flag | [ ] | `core/config/` | |
| K3-08 | Unit test cho mock | [ ] | | |

## 2. Cần làm tiếp

1. [ ] Gói 4 và Gói 5 review chữ ký MVP. Báo nhóm trước khi merge vào `dev`.
2. [ ] Đồng bộ trạng thái K3-01 và K3-03 lên Google Sheet khi có kết nối Google Drive.

## 3. Nhật ký phiên

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
| 2026-11-26 | Review các lựa chọn MVP trong code, gồm Email/password và Google, signed URL, `join({ roomId })`, vòng đời media track, `ImageData`, panel React và `FrameManifest.version: 1` | Gói 4, Gói 5 |
| 2026-11-26 | Thiết kế realtime yêu cầu tải lại state khi participant attribute `role` đổi. Danh sách hàm của `RoomPort` mới có `participants()` để đọc snapshot. Gói 4 và Gói 5 cần thống nhất cách UI nhận thay đổi | Gói 4, Gói 5 |
| 2026-11-19 | Tên biến `.env` chọn adapter của từng port | Phú (Gói 3) |

## Cập nhật thế nào

1. Bắt đầu phiên: đọc mục 1 và 2, chọn một việc `[ ]` hoặc `[!]`, đổi thành `[~]`.
2. Thêm mục mới vào đầu mục 3, ghi giờ bắt đầu và người / agent.
3. Xong việc: chạy lệnh kiểm chứng trong DoD, dán kết quả vào "Kiểm chứng". Chỉ đổi `[x]` khi kiểm chứng qua.
4. Cập nhật mục 2 và trạng thái trên Google Sheet.
5. Gặp điều chưa chốt: ghi vào mục 4, không tự chọn.
