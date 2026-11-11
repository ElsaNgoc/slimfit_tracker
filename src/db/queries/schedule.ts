import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { parseWeeklySchedule, type WeeklySchedule } from "@/lib/workout-templates";

/** Lịch tập tuần của user; chưa thiết lập (null) hoặc sai định dạng → lịch mặc định. */
export async function getWeeklySchedule(userId: string | null): Promise<WeeklySchedule> {
  if (!userId) return parseWeeklySchedule(null);
  const [row] = await db
    .select({ weeklySchedule: users.weeklySchedule })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseWeeklySchedule(row?.weeklySchedule ?? null);
}
