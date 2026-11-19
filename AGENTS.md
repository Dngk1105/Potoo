# Phô tô bút

Photobooth online cho nhóm bạn: tạo phòng, video call, đếm ngược chụp cùng lúc, ghép ảnh vào khung, chỉnh ảnh chung,
lưu và chia sẻ trong gallery. Web chạy trên điện thoại và laptop. Next.js + TypeScript, Supabase, LiveKit.

Nhóm 5 người, mỗi người phụ trách một gói. File này là luật chung cho mọi agent (Claude, Antigravity, Codex, Gemini).
Luật riêng của Claude nằm trong `CLAUDE.md`.

## Đọc gì

Không đọc hết `docs/`. Bắt đầu từ `docs/architecture.md`: toàn cảnh, rồi bảng "Gặp vấn đề thì đọc file nào".

## Theo dõi việc

- Danh sách gói, module, người phụ trách: `docs/modules/README.md`.
- Làm việc trong một gói hoặc module: đọc `docs/modules/<tên>/README.md` và `BUILD-TRACK.md` trước khi sửa.
- Hết phiên: cập nhật `BUILD-TRACK.md` của gói đó theo mục "Cập nhật thế nào" trong file. Ghi người và agent, dán kết quả lệnh kiểm chứng.
- Gói hoặc module mới: copy `docs/modules/_template/`, thêm một dòng vào `docs/modules/README.md`.
- Chỉ sửa `BUILD-TRACK.md` của gói mình. Thấy gói khác lệch docs: báo người làm.

## Luật

- Kiến trúc chốt cùng cả nhóm từng phần. Chưa chốt thì bàn trong chat hoặc nhóm, không ghi vào docs.
- Code tuân thủ docs. Thấy code lệch docs: cảnh báo người làm, không tự chọn bên nào đúng.
- Module của ai người đó sửa. Sửa module người khác hoặc `core/contracts/`: hỏi người làm trước.
- Không push thẳng `staging`, `main`. Không `push --force` lên `dev`, `staging`, `main`.
- Không sửa migration đã push; muốn đổi thì tạo migration mới.
- Không in, commit hoặc dán vào chat giá trị secret (`.env`, key Supabase, secret LiveKit).

## Viết comment, docs, chat

| Việc                                           | Đọc trước            |
| ----------------------------------------------- | ------------------------ |
| Docs (tiếng Việt, thuật ngữ tiếng Anh, 5C) | `docs/writing-docs.md` |
| Thuật ngữ                                     | `docs/glossary.yaml`   |
| Giọng văn tiếng Việt (chat, docs)           | skill `photobooth-vn`  |

- Viết hoặc sửa file trong `docs/`, trả lời về kiến trúc: nạp skill `photobooth-vn` trước.
- Chat với người làm: tiếng Việt, câu ngắn, thuật ngữ viết đúng `term` trong `docs/glossary.yaml`.
- Comment trong code viết tiếng Anh.
- Repo: [github.com/Dngk1105/Potoo](https://github.com/Dngk1105/Potoo). Nhánh mặc định `dev`.
- Checklist tiến độ: [docs.google.com/spreadsheets/d/1vT9GY4fO8CvbNJsM6i5-yVfQ2SiD8umE0ywD-h5S3XU/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1vT9GY4fO8CvbNJsM6i5-yVfQ2SiD8umE0ywD-h5S3XU/edit?usp=sharing)

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
