"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Tab = { href: string; label: string; icon: ReactNode };

const iconProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** 3 tab chính của app. Thêm tab mới: thêm phần tử vào đây (route phải được proxy.ts bảo vệ). */
export const NAV_TABS: Tab[] = [
  {
    href: "/",
    label: "Tổng quan",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/workouts",
    label: "Tập luyện",
    icon: (
      <svg {...iconProps}>
        <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Hồ sơ",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export function isTabActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * - `bottom`: thanh tab cố định đáy màn hình (mobile, ẩn từ `md`).
 * - `top`: tab ngang trong header (desktop, chỉ hiện từ `md`).
 */
export function TabNav({ variant }: { variant: "bottom" | "top" }) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 md:flex">
        {NAV_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${
                active ? "bg-primary/15 text-link" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-3xl grid-cols-3">
        {NAV_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  active ? "text-accent" : "text-muted-foreground active:text-foreground/85"
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
