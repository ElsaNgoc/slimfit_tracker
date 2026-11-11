"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workoutLogs, workoutSets, type WorkoutLog, type WorkoutSet } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";

// ---------- Schemas ----------

const idSchema = z.number().int().positive();
const notesSchema = z.string().trim().max(1000).nullish();

const createWorkoutLogSchema = z.object({
  date: z.iso.date(), // YYYY-MM-DD
  notes: notesSchema,
});

const updateWorkoutLogSchema = z.object({
  id: idSchema,
  date: z.iso.date().optional(),
  notes: notesSchema,
});

const setSchema = z.object({
  exerciseId: idSchema,
  setNumber: z.number().int().min(1).max(100),
  reps: z.number().int().min(0).max(1000),
  weight: z.number().min(0).max(1000).nullish(), // kg; null = bodyweight
});

const saveWorkoutSetsSchema = z.object({
  workoutLogId: idSchema,
  sets: z.array(setSchema).max(200),
});

export type CreateWorkoutLogInput = z.input<typeof createWorkoutLogSchema>;
export type UpdateWorkoutLogInput = z.input<typeof updateWorkoutLogSchema>;
export type SaveWorkoutSetsInput = z.input<typeof saveWorkoutSetsSchema>;

// ---------- Helpers ----------

async function assertOwnsLog(userId: string, logId: number) {
  const [log] = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, logId), eq(workoutLogs.userId, userId)))
    .limit(1);
  return Boolean(log);
}

// ---------- Actions ----------

/** POST — tạo buổi tập mới. */
export async function createWorkoutLog(
  input: CreateWorkoutLogInput,
): Promise<ActionResult<WorkoutLog>> {
  try {
    const userId = await requireUserId();
    const data = createWorkoutLogSchema.parse(input);

    const [log] = await db
      .insert(workoutLogs)
      .values({ userId, date: data.date, notes: data.notes ?? null })
      .returning();

    return { ok: true, data: log };
  } catch (err) {
    return toActionError(err);
  }
}

/** PUT — cập nhật ngày / ghi chú của buổi tập (chỉ chủ sở hữu). */
export async function updateWorkoutLog(
  input: UpdateWorkoutLogInput,
): Promise<ActionResult<WorkoutLog>> {
  try {
    const userId = await requireUserId();
    const { id, ...patch } = updateWorkoutLogSchema.parse(input);

    const values: Partial<Pick<WorkoutLog, "date" | "notes">> = {};
    if (patch.date !== undefined) values.date = patch.date;
    if (patch.notes !== undefined) values.notes = patch.notes ?? null;

    if (Object.keys(values).length === 0) {
      return { ok: false, error: "Không có gì để cập nhật." };
    }

    const [log] = await db
      .update(workoutLogs)
      .set(values)
      .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, userId)))
      .returning();

    if (!log) return { ok: false, error: "Không tìm thấy buổi tập." };
    return { ok: true, data: log };
  } catch (err) {
    return toActionError(err);
  }
}

/** DELETE — xoá buổi tập (các set bị xoá theo nhờ ON DELETE CASCADE). */
export async function deleteWorkoutLog(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const logId = idSchema.parse(id);

    const [deleted] = await db
      .delete(workoutLogs)
      .where(and(eq(workoutLogs.id, logId), eq(workoutLogs.userId, userId)))
      .returning({ id: workoutLogs.id });

    if (!deleted) return { ok: false, error: "Không tìm thấy buổi tập." };
    return { ok: true, data: deleted };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * PUT — thay toàn bộ danh sách set của một buổi tập.
 * Chạy delete + insert trong 1 `db.batch` (neon-http thực thi batch như một transaction).
 */
export async function saveWorkoutSets(
  input: SaveWorkoutSetsInput,
): Promise<ActionResult<WorkoutSet[]>> {
  try {
    const userId = await requireUserId();
    const { workoutLogId, sets } = saveWorkoutSetsSchema.parse(input);

    if (!(await assertOwnsLog(userId, workoutLogId))) {
      return { ok: false, error: "Không tìm thấy buổi tập." };
    }

    const deleteQuery = db.delete(workoutSets).where(eq(workoutSets.workoutLogId, workoutLogId));

    if (sets.length === 0) {
      await deleteQuery;
      return { ok: true, data: [] };
    }

    const [, inserted] = await db.batch([
      deleteQuery,
      db
        .insert(workoutSets)
        .values(
          sets.map((s) => ({
            workoutLogId,
            exerciseId: s.exerciseId,
            setNumber: s.setNumber,
            reps: s.reps,
            weight: s.weight ?? null,
          })),
        )
        .returning(),
    ]);

    return { ok: true, data: inserted };
  } catch (err) {
    return toActionError(err);
  }
}
