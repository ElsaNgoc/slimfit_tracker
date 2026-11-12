import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { workoutLogs, workoutSets } from "@/db/schema";

export type LoggedSet = {
  id: number;
  exerciseId: number;
  phase: "main" | "finisher";
  setNumber: number;
  reps: number | null;
  weight: number | null;
  durationSec: number | null;
  completed: boolean;
};

/**
 * Buổi tập của user trong ngày `date` (đã auto-save) để màn hình tập dựng lại sau khi tải lại trang.
 * Set sắp theo thứ tự ghi (id) → các bài hiện đúng thứ tự đã tập. null = chưa có buổi tập.
 */
export async function getWorkoutForDate(
  userId: string,
  date: string,
): Promise<{ logId: number; notes: string | null; sets: LoggedSet[] } | null> {
  const [log] = await db
    .select({ id: workoutLogs.id, notes: workoutLogs.notes })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), eq(workoutLogs.date, date)))
    .orderBy(asc(workoutLogs.id))
    .limit(1);
  if (!log) return null;

  const sets = await db
    .select({
      id: workoutSets.id,
      exerciseId: workoutSets.exerciseId,
      phase: workoutSets.phase,
      setNumber: workoutSets.setNumber,
      reps: workoutSets.reps,
      weight: workoutSets.weight,
      durationSec: workoutSets.durationSec,
      completed: workoutSets.completed,
    })
    .from(workoutSets)
    .where(eq(workoutSets.workoutLogId, log.id))
    .orderBy(asc(workoutSets.id));
  return { logId: log.id, notes: log.notes, sets };
}
