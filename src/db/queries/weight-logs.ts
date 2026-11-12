import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { weightLogs } from "@/db/schema";

/** Toàn bộ lịch sử cân nặng của user, sắp theo ngày tăng dần (biểu đồ tab Hồ sơ). */
export function getWeightLogs(userId: string) {
  return db
    .select({ date: weightLogs.date, weightKg: weightLogs.weightKg })
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .orderBy(asc(weightLogs.date));
}
