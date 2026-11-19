# Module và gói việc

Mỗi gói việc hoặc module có một thư mục: `README.md` (làm gì, sở hữu gì, export gì) và `BUILD-TRACK.md` (tiến độ,
nhật ký phiên). Agent theo dõi tiến độ cả nhóm: đọc bảng này, rồi mở `BUILD-TRACK.md` của dòng cần xem.

Tạo mới: copy [`_template/`](_template/) thành `docs/modules/<tên>/`, rồi thêm một dòng vào bảng.

| Thư mục | Việc | Người phụ trách | Mã checklist |
|---|---|---|---|
| [`infra/`](infra/) | Thiết kế chung, repo, hạ tầng, CI/CD | Dũng | K0-01 đến K1-07 |
| [`ui-shell/`](ui-shell/) | Giao diện khung, design system, luồng room | Chưa có | K5-01 đến K5-08 |
