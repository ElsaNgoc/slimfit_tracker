import Link from "next/link";
import type { ReactNode } from "react";
import { CurrentThemeName } from "./ThemeSwitcher";

/** Menu dạng danh sách cuối tab Hồ sơ — mỗi mục mở 1 trang con (nút Back của điện thoại quay lại được). */
export function ProfileMenu({ customFoodCount }: { customFoodCount: number }) {
  const items: { href: string; icon: string; label: string; detail: ReactNode }[] = [
    {
      href: "/profile/foods",
      icon: "📖",
      label: "Từ điển món ăn của tôi",
      detail: customFoodCount > 0 ? `${customFoodCount} món` : "Chưa có món",
    },
    { href: "/profile/guide", icon: "💡", label: "Hướng dẫn sử dụng", detail: null },
    { href: "/profile/appearance", icon: "🎨", label: "Cài đặt giao diện", detail: <CurrentThemeName /> },
  ];

  return (
    <nav aria-label="Cài đặt & tiện ích" className="overflow-hidden rounded-2xl bg-card">
      <ul className="divide-y divide-background/60">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/5 active:bg-foreground/10"
            >
              <span aria-hidden className="text-xl">
                {item.icon}
              </span>
              <span className="flex-1 font-medium text-foreground">{item.label}</span>
              {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
              <span aria-hidden className="text-lg text-muted-foreground">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Đầu trang con của Hồ sơ: nút quay lại + tiêu đề. */
export function SubPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <Link
        href="/profile"
        className="-ml-2 inline-flex h-11 w-fit items-center gap-1 rounded-full px-2 text-sm font-medium text-link"
      >
        <span aria-hidden>‹</span> Hồ sơ
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}
