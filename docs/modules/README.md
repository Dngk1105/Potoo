# Module và gói việc

Mỗi gói việc hoặc module có một thư mục: `README.md` (làm gì, sở hữu gì, export gì) và `BUILD-TRACK.md` (tiến độ,
nhật ký phiên). Agent theo dõi tiến độ cả nhóm: đọc bảng này, rồi mở `BUILD-TRACK.md` của dòng cần xem.

Tạo mới: copy [`_template/`](_template/) thành `docs/modules/<tên>/`, rồi thêm một dòng vào bảng.

| Thư mục | Việc | Người phụ trách | Mã checklist |
|---|---|---|---|
| [`infra/`](infra/) | Thiết kế chung, repo, hạ tầng, CI/CD, kiểm thử tích hợp | Dũng | K0-01 đến K1-07, K6-01 đến K6-06 |
| [`database/`](database/) | Migration, hàm SQL, RLS, seed, test RLS, type từ DB | Dũng (K2-01 đến K2-03), My (K2-04 đến K2-06) | K2-01 đến K2-06 |
| [`contracts/`](contracts/) | Port, plugin, FrameManifest, adapter mock, chọn adapter | Phú | K3-01 đến K3-08 |
| [`server-api/`](server-api/) | Route Handler, `can()`, adapter real | Bảo | K2-07, K4-01 đến K4-08 |
| [`ui-shell/`](ui-shell/) | Giao diện khung, design system, luồng room | Quân | K5-01 đến K5-08 |
