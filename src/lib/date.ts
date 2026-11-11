export const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Ngày hôm nay dạng `YYYY-MM-DD` theo giờ Việt Nam (server chạy UTC). */
export function todayInAppTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(now);
}

/** Năm hiện tại theo giờ Việt Nam. */
export function currentYearInAppTz(now: Date = new Date()): number {
  return Number(todayInAppTz(now).slice(0, 4));
}

/**
 * Thứ trong tuần (0 = Chủ nhật … 6 = Thứ 7, giống `Date#getDay()`) của chuỗi `YYYY-MM-DD`.
 * Tính theo UTC để kết quả giống nhau trên server (UTC) và trình duyệt (múi giờ bất kỳ),
 * tránh lệch hydration — chuỗi ngày đã được quy về giờ VN bởi `todayInAppTz()`.
 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "2026-11-09" → "09/11". */
export function formatDayMonth(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}
