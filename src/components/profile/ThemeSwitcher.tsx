"use client";

import { useSyncExternalStore } from "react";
import { THEMES, applyTheme, currentTheme, subscribeTheme, type ThemeId } from "@/lib/theme";

/** Theme đang dùng; null khi render phía server (chưa biết localStorage). */
export function useTheme(): ThemeId | null {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => null);
}

/** Tên theme hiện tại (dùng ở menu Hồ sơ). */
export function CurrentThemeName() {
  const theme = useTheme();
  const label = THEMES.find((t) => t.id === theme)?.label;
  return <span data-testid="current-theme">{label ?? ""}</span>;
}

/**
 * Chọn theme: 3 ô tròn xem trước (vòng ngoài = card, nửa trái = primary, nửa phải = accent, lõi = nền + chữ).
 * Radio group thật (← → để đổi) — đổi là áp dụng ngay, chuyển màu mượt, lưu localStorage.
 */
export function ThemeSwitcher() {
  const theme = useTheme();

  function select(id: ThemeId) {
    if (id !== theme) applyTheme(id);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Chọn giao diện"
      className="grid grid-cols-3 gap-3"
      onKeyDown={(e) => {
        if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
        e.preventDefault();
        const i = THEMES.findIndex((t) => t.id === theme);
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
        const next = THEMES[(Math.max(i, 0) + step + THEMES.length) % THEMES.length];
        select(next.id);
        document.getElementById(`theme-option-${next.id}`)?.focus();
      }}
    >
      {THEMES.map((t) => {
        const checked = theme === t.id;
        return (
          <button
            key={t.id}
            id={`theme-option-${t.id}`}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${t.label} — ${t.hint}`}
            tabIndex={checked || (theme === null && t.id === THEMES[0].id) ? 0 : -1}
            onClick={() => select(t.id)}
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              checked ? "bg-muted ring-2 ring-primary" : "bg-background ring-1 ring-border"
            }`}
          >
            <span
              aria-hidden
              className="relative flex size-16 items-center justify-center rounded-full"
              style={{ background: t.swatch.card }}
            >
              <span
                className="absolute inset-1.5 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${t.swatch.primary} 0 50%, ${t.swatch.accent} 50% 100%)`,
                }}
              />
              <span
                className="relative flex size-7 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: t.swatch.background, color: t.swatch.foreground }}
              >
                Aa
              </span>
            </span>
            <span className="text-sm font-semibold text-foreground">{t.label}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{t.hint.split(" · ")[0]}</span>
            <span className={`text-[11px] font-semibold text-link ${checked ? "" : "invisible"}`}>✓ Đang dùng</span>
          </button>
        );
      })}
    </div>
  );
}
