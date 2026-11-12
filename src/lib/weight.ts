/** Logic cân nặng thuần (server + client): giới hạn hợp lệ, lọc khoảng thời gian, vạch trục biểu đồ. */

export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 350;

export type WeightPoint = { date: string; weightKg: number };

export const WEIGHT_RANGES = [
  { id: "30d", label: "1 tháng", days: 30 },
  { id: "90d", label: "3 tháng", days: 90 },
  { id: "all", label: "Tất cả", days: null },
] as const;
export type WeightRangeId = (typeof WEIGHT_RANGES)[number]["id"];

/** Số ngày giữa 2 chuỗi YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Điểm trong khoảng `days` ngày gần nhất tính tới `today` (null = tất cả). Dữ liệu vào đã sắp tăng dần theo ngày. */
export function pointsInRange(points: readonly WeightPoint[], today: string, days: number | null): WeightPoint[] {
  if (days === null) return [...points];
  return points.filter((p) => daysBetween(p.date, today) < days);
}

/**
 * Vạch trục Y "tròn" (bước 0.5 / 1 / 2 / 5 / 10 kg) bao trọn [min, max], khoảng 3–5 vạch.
 * Có đệm để đường không dính sát mép; dữ liệu phẳng (min = max) vẫn ra được trục.
 */
export function niceWeightTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const step = [0.5, 1, 2, 5, 10, 20].find((s) => span / s <= 4) ?? 50;
  const lo = Math.floor((min - span * 0.1) / step) * step;
  const hi = Math.ceil((max + span * 0.1) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

/** "62,4" — tối đa 1 chữ số thập phân, dấu phẩy kiểu VN. */
export function formatKg(kg: number): string {
  return (Math.round(kg * 10) / 10).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

/** "−1,6" / "+0,8" / "0" — dấu trừ thật (U+2212) cho dễ đọc. */
export function formatKgDelta(delta: number): string {
  const r = Math.round(delta * 10) / 10;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${formatKg(Math.abs(r))}`;
}
