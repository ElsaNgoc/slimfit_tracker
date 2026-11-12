/**
 * Theme giao diện: 3 bộ màu (biến CSS trong src/app/globals.css), chọn bằng data-theme trên <html>,
 * lưu ở localStorage (theo thiết bị). Script THEME_INIT_SCRIPT chạy trong <head> TRƯỚC khi vẽ trang
 * → không nháy sai màu khi tải.
 */

export const THEMES = [
  {
    id: "warm",
    label: "Lửa",
    hint: "Warm · cam đất ấm áp",
    // 5 màu gốc để vẽ ô xem trước (nền · card · primary · accent · chữ)
    swatch: { background: "#1d0f0c", card: "#6b2c1d", primary: "#e65b39", accent: "#eb9510", foreground: "#fdf5da" },
  },
  {
    id: "cool",
    label: "Biển",
    hint: "Cool · xanh biển dịu mắt",
    swatch: { background: "#1e3842", card: "#295c69", primary: "#75d7de", accent: "#afcdf3", foreground: "#d8e9fd" },
  },
  {
    id: "vibrant",
    label: "Neon",
    hint: "Vibrant · tím hồng nổi bật",
    swatch: { background: "#130b1e", card: "#3d094e", primary: "#bb29ae", accent: "#eb3934", foreground: "#fdd7d1" },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "warm";
export const THEME_STORAGE_KEY = "slimfit-theme";
const THEME_EVENT = "slimfit-theme-change";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

const backgroundOf = (id: ThemeId) => THEMES.find((t) => t.id === id)!.swatch.background;

/**
 * Chạy inline trong <head>: đọc localStorage → đặt data-theme + màu thanh trạng thái (meta theme-color).
 * Viết tay bằng ES5, không import gì (chạy trước khi bundle JS tải).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var bg=${JSON.stringify(
  Object.fromEntries(THEMES.map((t) => [t.id, t.swatch.background])),
)};if(!bg[t])t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",bg[t]);}catch(e){}})();`;

/** Theme đang áp dụng (đọc từ <html>). */
export function currentTheme(): ThemeId {
  const t = document.documentElement.dataset.theme;
  return isThemeId(t) ? t : DEFAULT_THEME;
}

/** Đổi theme: lưu localStorage, chuyển màu mượt 300 ms, báo cho các component đang nghe. */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", backgroundOf(id));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Chế độ riêng tư / bộ nhớ đầy → vẫn đổi được trong phiên hiện tại
  }
  window.dispatchEvent(new Event(THEME_EVENT));
  window.setTimeout(() => root.classList.remove("theme-transition"), 350);
}

/** Đăng ký nghe thay đổi theme (cùng tab + tab khác qua sự kiện storage). Dùng với useSyncExternalStore. */
export function subscribeTheme(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    if (isThemeId(e.newValue)) document.documentElement.dataset.theme = e.newValue;
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
