import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyLogs, users } from "@/db/schema";

/** Dữ liệu cho Dashboard: hồ sơ user + nhật ký của ngày `date` (có thể chưa tồn tại). */
export async function getDashboardData(userId: string, date: string) {
  const [userRows, logRows] = await db.batch([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.date, date)))
      .limit(1),
  ]);

  return { user: userRows[0] ?? null, dailyLog: logRows[0] ?? null };
}
