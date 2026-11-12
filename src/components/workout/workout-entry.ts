import type { WorkoutPhase } from "@/lib/workout-templates";

/** Kiểu dữ liệu + kiểm tra ô nhập của màn hình tập (dùng chung WorkoutLogger / MainExerciseCard / FinisherSection). */

/** 1 hiệp (Bài Tập Chính) hoặc dòng hoàn thành (Đốt mỡ). Ô nhập giữ chuỗi; `id` null = chưa lưu xong. */
export type SetRow = { key: string; id: number | null; reps: string; weight: string; duration: string; completed: boolean };

export type Entry = { key: string; exerciseId: number; phase: WorkoutPhase; sets: SetRow[] };

const parseNum = (raw: string) => Number(raw.trim().replace(",", "."));

/** Rep + kg của 1 hiệp → giá trị hợp lệ để lưu, hoặc câu lỗi. */
export function parseMainSet(row: Pick<SetRow, "reps" | "weight">): { reps: number; weight: number | null } | string {
  const reps = parseNum(row.reps);
  if (!Number.isInteger(reps) || reps < 1 || reps > 1000) return "Số rep phải là số nguyên từ 1 đến 1000.";
  if (row.weight.trim() === "") return { reps, weight: null }; // bỏ trống = trọng lượng cơ thể
  const weight = parseNum(row.weight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 1000) return "Mức tạ phải từ 0 đến 1000 kg.";
  return { reps, weight: Math.round(weight * 100) / 100 };
}

/** Thời gian bài đốt mỡ (giây) — trống = null. */
export function parseDuration(raw: string): number | null | string {
  if (raw.trim() === "") return null;
  const sec = parseNum(raw);
  if (!Number.isInteger(sec) || sec < 1 || sec > 7200) return "Thời gian từ 1 đến 7200 giây.";
  return sec;
}
