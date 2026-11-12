"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { weeklyScheduleSchema, type WeeklySchedule } from "@/lib/workout-templates";

/**
 * PUT — lưu lịch tập tuần (7 template id, index = getDay(), 0 = Chủ nhật) vào `users.weekly_schedule`.
 * `refresh()` để /workouts và Dashboard render lại gợi ý theo lịch mới.
 */
export async function updateWeeklySchedule(schedule: WeeklySchedule): Promise<ActionResult<WeeklySchedule>> {
  try {
    const userId = await requireUserId();
    const data = weeklyScheduleSchema.parse(schedule);

    const [row] = await db
      .update(users)
      .set({ weeklySchedule: data })
      .where(eq(users.id, userId))
      .returning({ weeklySchedule: users.weeklySchedule });

    refresh();
    return { ok: true, data: row?.weeklySchedule ?? data };
  } catch (err) {
    return toActionError(err);
  }
}
