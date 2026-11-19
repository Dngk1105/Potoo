# Route Handler: `<tên module>`

<!-- Chỉ ghi Route Handler của module này. Luật quyền chung: docs/design/permissions.md. -->

| Method | Path | Ai được gọi | Ghi DB | Gọi dịch vụ ngoài |
|---|---|---|---|---|
| `POST` | `/api/<...>` | `<host, member, owner...>` | `<bảng, cột>` | `<LiveKit RoomService...>` |

## `POST /api/<...>`

**Body:** `<trường: kiểu>`

**Trả về:** `<trường: kiểu>`

| Mã | Khi |
|---|---|
| 200 | |
| 401 | Chưa đăng nhập |
| 403 | Không đủ quyền |
| 409 | `<xung đột, ví dụ room đã lock>` |
