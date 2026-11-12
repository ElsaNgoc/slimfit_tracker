import type { Metadata } from "next";
import { SubPageHeader } from "@/components/profile/ProfileMenu";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng — Slimfit Tracker",
};

const SECTIONS: { icon: string; title: string; steps: string[] }[] = [
  {
    icon: "🚀",
    title: "Bắt đầu",
    steps: [
      "Vào tab Hồ sơ, điền chiều cao, cân nặng, năm sinh, giới tính và mức vận động → app tính TDEE và mục tiêu calo mỗi ngày (TDEE − 600 kcal).",
      "Cân nặng trong hồ sơ được ghi luôn làm điểm đầu tiên của biểu đồ cân nặng.",
    ],
  },
  {
    icon: "🍽️",
    title: "Ghi bữa ăn",
    steps: [
      "Ở Tổng quan, bấm “+ Thêm món” trên bữa Sáng / Trưa / Tối / Phụ.",
      "Tab “Tìm món”: gõ tên (có dấu hay không đều được), chọn món, nhập số gram — calo và macro tự tính theo mốc 100 g.",
      "Tab “Tự nhập”: nhập tên + calo (khối lượng, macro tuỳ chọn). Tick “Lưu món này vào từ điển của tôi” để lần sau tìm được ngay.",
      "4 vòng tròn trên cùng cho biết đã ăn bao nhiêu % mục tiêu Calories / Protein / Carbs / Fat trong ngày.",
    ],
  },
  {
    icon: "📖",
    title: "Từ điển món ăn",
    steps: [
      "Hồ sơ → Từ điển món ăn của tôi: xem, sửa tên / số liệu (trên 100 g) hoặc xoá món đã lưu.",
      "Xoá món khỏi từ điển không làm mất các bữa ăn đã ghi trước đó.",
    ],
  },
  {
    icon: "🏋️",
    title: "Tập luyện",
    steps: [
      "Tổng quan hiện buổi tập hôm nay theo lịch tuần; bấm “Bắt đầu tập” để nạp sẵn bài.",
      "Tab Tập luyện: nhập set / rep / tạ, bấm tên bài để xem ảnh tư thế và hướng dẫn, nút ⇄ để đổi bài cùng nhóm cơ.",
      "“⚙️ Cài đặt lịch tuần” để chọn buổi tập cho từng ngày; thư viện video Yoga & Giãn cơ ở cuối trang.",
    ],
  },
  {
    icon: "⚖️",
    title: "Cân nặng",
    steps: [
      "Hồ sơ → “Cập nhật cân nặng hôm nay”. Nên cân cùng giờ mỗi lần (ví dụ buổi sáng, trước khi ăn).",
      "Nhập lại cùng ngày sẽ sửa số của ngày đó. Cân nặng mới nhất tự cập nhật TDEE và mục tiêu calo.",
      "Chạm / rê chuột lên biểu đồ để xem từng lần cân, hoặc bấm “Xem dạng bảng”.",
    ],
  },
  {
    icon: "✅",
    title: "Thói quen",
    steps: [
      "Thêm thói quen của riêng bạn hoặc chọn từ “Gợi ý làm đẹp”; ô tick tự làm mới sau nửa đêm.",
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <SubPageHeader title="Hướng dẫn sử dụng" description="Những thao tác cơ bản để dùng Slimfit hiệu quả." />
      {SECTIONS.map((s) => (
        <section key={s.title} aria-labelledby={`guide-${s.title}`} className="flex flex-col gap-2 rounded-2xl bg-card p-4">
          <h2 id={`guide-${s.title}`} className="flex items-center gap-2 font-semibold text-foreground">
            <span aria-hidden>{s.icon}</span>
            {s.title}
          </h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground/85 marker:text-muted-foreground">
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
