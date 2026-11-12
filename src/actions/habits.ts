"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { habitLogs, habits, type Habit } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { HABIT_NAME_MAX, normalizeHabitName } from "@/lib/habits";

const habitName = z
  .string()
  .transform(normalizeHabitName)
  .pipe(z.string().min(1, "Nhập tên thói quen.").max(HABIT_NAME_MAX, `Tối đa ${HABIT_NAME_MAX} ký tự.`));

const habitId = z.number().int().positive();

/** POST — tạo thói quen mới. Trùng tên (không phân biệt hoa thường) → báo lỗi, không tạo thêm. */
export async function createHabit(input: { name: string }): Promise<ActionResult<Habit>> {
  try {
    const userId = await requireUserId();
    const name = habitName.parse(input.name);

    // unique (user_id, lower(name)) → trùng thì không chèn, returning rỗng (an toàn cả khi bấm 2 lần cùng lúc)
    const [habit] = await db.insert(habits).values({ userId, name }).onConflictDoNothing().returning();
    if (!habit) return { ok: false, error: `Đã có thói quen "${name}".` };
    return { ok: true, data: habit };
  } catch (err) {
    return toActionError(err);
  }
}

/** DELETE — xoá thói quen của chính user (lịch sử habit_logs bị xoá theo, ON DELETE CASCADE). */
export async function deleteHabit(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const hid = habitId.parse(id);
    const deleted = await db
      .delete(habits)
      .where(and(eq(habits.id, hid), eq(habits.userId, userId)))
      .returning({ id: habits.id });
    if (deleted.length === 0) return { ok: false, error: "Không tìm thấy thói quen." };
    return { ok: true, data: deleted[0] };
  } catch (err) {
    return toActionError(err);
  }
}

const setCompletedSchema = z.object({
  habitId,
  date: z.iso.date(), // YYYY-MM-DD theo giờ VN (server truyền xuống)
  completed: z.boolean(),
});

/** PUT — check / bỏ check thói quen cho 1 ngày (upsert theo habit_id + date). */
export async function setHabitCompleted(
  input: z.input<typeof setCompletedSchema>,
): Promise<ActionResult<{ habitId: number; date: string; completed: boolean }>> {
  try {
    const userId = await requireUserId();
    const data = setCompletedSchema.parse(input);

    // Chỉ cho ghi log vào thói quen của chính mình
    const [owned] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, data.habitId), eq(habits.userId, userId)))
      .limit(1);
    if (!owned) return { ok: false, error: "Không tìm thấy thói quen." };

    const [log] = await db
      .insert(habitLogs)
      .values({ habitId: data.habitId, userId, date: data.date, completed: data.completed })
      .onConflictDoUpdate({ target: [habitLogs.habitId, habitLogs.date], set: { completed: data.completed } })
      .returning({ habitId: habitLogs.habitId, date: habitLogs.date, completed: habitLogs.completed });
    return { ok: true, data: log };
  } catch (err) {
    return toActionError(err);
  }
}
