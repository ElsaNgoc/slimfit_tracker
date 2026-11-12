import type { Metadata } from "next";
import { SubPageHeader } from "@/components/profile/ProfileMenu";
import { ThemeSwitcher } from "@/components/profile/ThemeSwitcher";

export const metadata: Metadata = {
  title: "Cài đặt giao diện — Slimfit Tracker",
};

export default function AppearancePage() {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <SubPageHeader title="Cài đặt giao diện" description="Chọn bộ màu cho toàn app. Lựa chọn được lưu trên thiết bị này." />

      <section aria-labelledby="theme-title" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
        <h2 id="theme-title" className="font-semibold text-foreground">
          Bộ màu
        </h2>
        <ThemeSwitcher />
      </section>

      {/* Xem trước: các thành phần thật dùng token màu → đổi theme thấy ngay */}
      <section aria-labelledby="preview-title" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
        <h2 id="preview-title" className="font-semibold text-foreground">
          Xem trước
        </h2>
        <div className="flex flex-col gap-3 rounded-xl bg-background p-3">
          <p className="text-sm text-foreground">
            Chữ chính · <span className="text-muted-foreground">chữ phụ</span> ·{" "}
            <span className="font-medium text-link">liên kết</span> · <span className="text-accent">★ biểu tượng</span>
          </p>
          <input
            aria-label="Ô nhập mẫu"
            placeholder="Ô nhập…"
            className="h-11 rounded-xl border border-border bg-background px-3 text-foreground placeholder:text-faint focus:border-primary focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <span className="flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              Nút chính
            </span>
            <span className="flex h-11 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-foreground">
              Nút phụ
            </span>
          </div>
          <p className="text-sm text-destructive">Thông báo lỗi mẫu</p>
        </div>
      </section>
    </div>
  );
}
