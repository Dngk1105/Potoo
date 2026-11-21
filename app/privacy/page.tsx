import type { Metadata } from "next";

// Privacy policy linked from the Google OAuth consent screen.
// Static text only; keep it in sync with docs/design/database.md (storage, shot cleanup).
export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư · Potoo",
  description: "Potoo thu thập dữ liệu gì, dùng vào việc gì và giữ trong bao lâu.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed">
      <h1 className="mb-2 text-2xl font-bold">Chính sách quyền riêng tư</h1>
      <p className="mb-8 text-sm text-gray-500">Cập nhật ngày 21/11/2026</p>

      <p className="mb-6">
        Potoo (Phô tô bút) là photobooth online cho nhóm bạn, do một nhóm 5 sinh viên làm cho đồ án
        môn học. Trang này nói Potoo thu thập dữ liệu gì, dùng vào việc gì và giữ trong bao lâu.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-semibold">1. Dữ liệu thu thập</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Khi đăng nhập bằng Google: email, tên hiển thị và ảnh đại diện của tài khoản Google.
        </li>
        <li>Khi đăng nhập bằng email: địa chỉ email.</li>
        <li>Ảnh chụp trong buổi chụp (shot) và ảnh thành phẩm (strip) bạn tạo.</li>
        <li>
          Bình luận, reaction, danh sách bạn bè và các file bạn tải lên (frame, sticker, filter).
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-semibold">2. Dùng vào việc gì</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Đăng nhập và hiện tên, ảnh đại diện của bạn cho người cùng phòng chụp.</li>
        <li>Ghép ảnh, lưu và chia sẻ strip theo mức chia sẻ bạn chọn.</li>
        <li>Potoo không bán dữ liệu, không chạy quảng cáo và không dùng dữ liệu vào việc khác.</li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-semibold">3. Video call</h2>
      <p>
        Video trong phòng chụp truyền trực tiếp giữa các thành viên qua LiveKit Cloud. Potoo không
        ghi lại video.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-semibold">4. Lưu ở đâu, giữ bao lâu</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Dữ liệu và ảnh lưu trên Supabase, máy chủ ở Singapore. Ảnh lưu ở kho riêng tư, chỉ người
          có quyền mới xem được.
        </li>
        <li>Shot tự xoá sau 24 giờ kể từ khi buổi chụp kết thúc. Strip đã xuất vẫn được giữ.</li>
        <li>Web chạy trên Vercel.</li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-semibold">5. Ai xem được ảnh của bạn</h2>
      <p>
        Mỗi người có mặt trong strip tự chọn mức chia sẻ: chỉ mình, người cùng buổi chụp, bạn bè,
        hoặc ai có link. Người khác chỉ xem được strip khi mọi người có mặt trong strip đều cho
        phép.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-semibold">6. Xoá dữ liệu và liên hệ</h2>
      <p>
        Muốn xoá tài khoản và toàn bộ dữ liệu, hoặc có câu hỏi về trang này: mở issue tại{" "}
        <a className="text-blue-600 underline" href="https://github.com/Dngk1105/Potoo/issues">
          github.com/Dngk1105/Potoo/issues
        </a>
        . Nhóm xử lý trong vòng 7 ngày.
      </p>
    </main>
  );
}
