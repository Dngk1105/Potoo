---
name: photobooth-vn
description: >
  Giọng văn tiếng Việt cho repo Phô tô bút: chat và docs viết tiếng Việt, thuật ngữ giữ đúng `term` trong
  docs/glossary.yaml, theo 5C. Dùng mỗi khi trả lời người làm về kiến trúc, code, hạ tầng của Phô tô bút,
  hoặc khi viết/sửa file trong docs/. Không dùng cho comment trong code (comment viết tiếng Anh).
---

# Giọng văn Phô tô bút

## Trước khi viết

1. Đọc `docs/glossary.yaml`. Mỗi khái niệm có trong đó viết đúng `term`; không dùng từ trong `avoid`.
2. Viết docs: đọc thêm `docs/writing-docs.md`.

## Ví dụ

| Không | Có |
|---|---|
| Chủ phòng bấm chụp thì mọi người đếm ngược cùng nhau. | Host gửi `START_SHOT`; mỗi member bắt đầu countdown của round đó. |
| Về cơ bản thì CI sẽ kiểm tra code trước khi gộp. | PR vào `dev` chạy lint, typecheck, Vitest và test RLS; một bước đỏ thì không merge được. |
| Bạn có thể cân nhắc giảm chất lượng ảnh một chút. | Shot lưu JPEG chất lượng 0,92. Đổi trong `core/config/`. |

Số trong ví dụ thứ ba chỉ minh hoạ mẫu câu; khi viết thật thì lấy số từ code hoặc docs.

## Luật

- Thuật ngữ: giữ y nguyên `term` tiếng Anh, kể cả khi đứng giữa câu tiếng Việt. Tên hàm, file, lệnh, bảng, cột để trong backtick.
- Thuật ngữ chưa có trong glossary: hỏi người làm, hoặc đề xuất mục mới cho glossary. Không tự dịch.
- 5C:
  - Clear: câu đơn, một nghĩa.
  - Concise: bỏ từ đệm ("về cơ bản", "thực ra", "có lẽ", "thường thì", "một chút") và đại từ thừa.
  - Complete: đủ bước, thông số, điều kiện.
  - Correct: tên dịch vụ, giới hạn gói free, version, số liệu lấy từ code, docs hoặc trang chính thức. Chưa có thì hỏi.
  - Concrete: số kèm đơn vị thay cho "nhanh", "lâu", "lớn".
- Mẫu câu: `[chủ thể] [làm gì] [vì sao/khi nào]`.
- Nhiều bước: đánh số, mỗi bước một hành động.

## Mức nén

| Nơi | Mức |
|---|---|
| Chat | Câu ngắn, được bỏ chủ ngữ khi đã rõ. Hành động hoặc kết luận đứng đầu |
| Docs | Câu đủ ngữ pháp, chỉ bỏ từ đệm. Mỗi đoạn một ý |

Bỏ nén, viết đầy đủ khi: cảnh báo mất dữ liệu hoặc lộ secret, xác nhận lệnh không đảo ngược được
(`git push --force`, `supabase db reset` trên cloud, drop bảng), hoặc người làm nói chưa hiểu.
