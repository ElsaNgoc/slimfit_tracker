"use server";

import { z } from "zod";
import { db } from "@/db";
import { dailyLogs, type DailyLog } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";

const upsertDailyLogSchema = z.object({
  date: z.iso.date(), // YYYY-MM-DD
  totalCalories: z.number().int().min(0).max(20000).optional(),
  yogaCompleted: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullish(),
});

export type UpsertDailyLogInput = z.input<typeof upsertDailyLogSchema>;

/**
 * POST/PUT — tạo hoặc cập nhật nhật ký của 1 ngày.
 * Dựa vào unique (user_id, date): nếu đã có bản ghi thì chỉ cập nhật các field được gửi lên.
 */
export async function upsertDailyLog(
  input: UpsertDailyLogInput,
): Promise<ActionResult<DailyLog>> {
  try {
    const userId = await requireUserId();
    const { date, ...fields } = upsertDailyLogSchema.parse(input);

    const patch: Partial<Pick<DailyLog, "totalCalories" | "yogaCompleted" | "notes">> = {};
    if (fields.totalCalories !== undefined) patch.totalCalories = fields.totalCalories;
    if (fields.yogaCompleted !== undefined) patch.yogaCompleted = fields.yogaCompleted;
    if (fields.notes !== undefined) patch.notes = fields.notes ?? null;

    const insert = db.insert(dailyLogs).values({ userId, date, ...patch });

    const [log] = await (Object.keys(patch).length > 0
      ? insert.onConflictDoUpdate({ target: [dailyLogs.userId, dailyLogs.date], set: patch })
      : // Không có field nào: chỉ đảm bảo bản ghi tồn tại, rồi trả về
        insert.onConflictDoUpdate({
          target: [dailyLogs.userId, dailyLogs.date],
          set: { userId },
        })
    ).returning();

    return { ok: true, data: log };
  } catch (err) {
    return toActionError(err);
  }
}
