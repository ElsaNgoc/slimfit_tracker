"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workoutLogs, workoutSets, type WorkoutSet } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { todayInAppTz } from "@/lib/date";

/*
 * Tự động lưu (auto-save) màn hình tập luyện: mỗi thao tác (thêm / sửa / xoá hiệp, tick bài đốt mỡ, đổi bài…)
 * là 1 lệnh ghi nhỏ. Buổi tập (workout_logs) của ngày được tạo ở lần ghi đầu tiên. Mọi lệnh đều lọc theo
 * buổi tập của chính user. Client gửi lệnh tuần tự (hàng đợi) nên "thêm" luôn xong trước "sửa" cùng hiệp.
 */

// ---------- Schemas ----------

const id = z.number().int().positive();
const date = z.iso.date().refine((d) => d <= todayInAppTz(), "Không thể ghi buổi tập cho ngày trong tương lai.");
const reps = z.number().int().min(1, "Số rep phải từ 1 đến 1000.").max(1000, "Số rep phải từ 1 đến 1000.");
const weight = z.number().min(0, "Mức tạ phải từ 0 đến 1000 kg.").max(1000, "Mức tạ phải từ 0 đến 1000 kg.").nullable(); // null = bodyweight
const durationSec = z.number().int().min(1).max(7200).nullable();

const addWorkoutSetSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("main"), date, exerciseId: id, reps, weight }),
  z.object({
    phase: z.literal("finisher"),
    date,
    exerciseId: id,
    completed: z.boolean().default(true),
    durationSec: durationSec.default(null),
  }),
]);

const updateWorkoutSetSchema = z
  .object({ id, reps: reps.optional(), weight: weight.optional(), durationSec: durationSec.optional(), completed: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 1, "Không có gì để cập nhật.");

const changeExerciseSchema = z.object({ logId: id, fromExerciseId: id, toExerciseId: id });
const removeExerciseSchema = z.object({ logId: id, exerciseId: id });
const notesSchema = z.object({ date, notes: z.string().trim().max(1000) });

export type AddWorkoutSetInput = z.input<typeof addWorkoutSetSchema>;
export type UpdateWorkoutSetInput = z.input<typeof updateWorkoutSetSchema>;

// ---------- Helpers ----------

/** Buổi tập của user trong ngày `date` — chưa có thì tạo (1 buổi / ngày; dữ liệu cũ có nhiều buổi thì lấy buổi đầu). */
async function ensureLog(userId: string, day: string): Promise<number> {
  const [found] = await db
    .select({ id: workoutLogs.id })
    .from(workoutLogs)
    .where(and(eq(workoutLogs.userId, userId), eq(workoutLogs.date, day)))
    .orderBy(asc(workoutLogs.id))
    .limit(1);
  if (found) return found.id;
  const [created] = await db.insert(workoutLogs).values({ userId, date: day }).returning({ id: workoutLogs.id });
  return created.id;
}

/** Subquery id các buổi tập của user — điều kiện sở hữu cho mọi lệnh sửa / xoá set. */
const ownLogIds = (userId: string) =>
  db.select({ id: workoutLogs.id }).from(workoutLogs).where(eq(workoutLogs.userId, userId));

/** Thông báo do mình viết (tiếng Việt có dấu) — khác thông báo mặc định tiếng Anh của zod. */
const VIETNAMESE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;

/** Lỗi validate có thông báo tiếng Việt → trả nguyên câu cho người dùng; còn lại → lỗi chung. */
function fail(err: unknown): ActionResult<never> {
  if (err instanceof z.ZodError) {
    const message = err.issues.find((i) => VIETNAMESE.test(i.message))?.message;
    if (message) return { ok: false, error: message };
  }
  return toActionError(err);
}

// ---------- Actions ----------

/**
 * Thêm 1 hiệp (Bài Tập Chính: rep × kg) hoặc 1 dòng hoàn thành bài đốt mỡ. Tự tạo buổi tập của ngày nếu chưa có.
 * set_number tính ngay trong câu INSERT (max + 1 của bài đó trong buổi) → không lệch dù client đánh số khác.
 */
export async function addWorkoutSet(input: AddWorkoutSetInput): Promise<ActionResult<{ logId: number; set: WorkoutSet }>> {
  try {
    const userId = await requireUserId();
    const data = addWorkoutSetSchema.parse(input);
    const logId = await ensureLog(userId, data.date);

    const nextSetNumber = sql<number>`(
      select coalesce(max(${workoutSets.setNumber}), 0) + 1 from ${workoutSets}
      where ${workoutSets.workoutLogId} = ${logId} and ${workoutSets.exerciseId} = ${data.exerciseId}
    )`;
    const values =
      data.phase === "main"
        ? { phase: "main" as const, reps: data.reps, weight: data.weight }
        : { phase: "finisher" as const, completed: data.completed, durationSec: data.durationSec };

    const [set] = await db
      .insert(workoutSets)
      .values({ workoutLogId: logId, exerciseId: data.exerciseId, setNumber: nextSetNumber, ...values })
      .returning();
    return { ok: true, data: { logId, set } };
  } catch (err) {
    return fail(err);
  }
}

/** Sửa số rep / kg của 1 hiệp, hoặc trạng thái hoàn thành / thời gian của bài đốt mỡ. */
export async function updateWorkoutSet(input: UpdateWorkoutSetInput): Promise<ActionResult<WorkoutSet>> {
  try {
    const userId = await requireUserId();
    const { id: setId, ...patch } = updateWorkoutSetSchema.parse(input);
    const [set] = await db
      .update(workoutSets)
      .set(patch)
      .where(and(eq(workoutSets.id, setId), inArray(workoutSets.workoutLogId, ownLogIds(userId))))
      .returning();
    if (!set) return { ok: false, error: "Không tìm thấy hiệp tập." };
    return { ok: true, data: set };
  } catch (err) {
    return fail(err);
  }
}

/** Xoá 1 hiệp. */
export async function deleteWorkoutSet(setId: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const parsed = id.parse(setId);
    const [deleted] = await db
      .delete(workoutSets)
      .where(and(eq(workoutSets.id, parsed), inArray(workoutSets.workoutLogId, ownLogIds(userId))))
      .returning({ id: workoutSets.id });
    if (!deleted) return { ok: false, error: "Không tìm thấy hiệp tập." };
    return { ok: true, data: deleted };
  } catch (err) {
    return fail(err);
  }
}

/** Đổi bài (nút ⇄ Thay thế): chuyển mọi hiệp đã ghi của bài cũ sang bài mới, giữ nguyên số liệu. */
export async function changeWorkoutExercise(
  input: z.input<typeof changeExerciseSchema>,
): Promise<ActionResult<{ count: number }>> {
  try {
    const userId = await requireUserId();
    const { logId, fromExerciseId, toExerciseId } = changeExerciseSchema.parse(input);
    const moved = await db
      .update(workoutSets)
      .set({ exerciseId: toExerciseId })
      .where(
        and(
          eq(workoutSets.workoutLogId, logId),
          eq(workoutSets.exerciseId, fromExerciseId),
          inArray(workoutSets.workoutLogId, ownLogIds(userId)),
        ),
      )
      .returning({ id: workoutSets.id });
    return { ok: true, data: { count: moved.length } };
  } catch (err) {
    return fail(err);
  }
}

/** Bỏ 1 bài khỏi buổi tập: xoá mọi hiệp đã ghi của bài đó. */
export async function removeWorkoutExercise(
  input: z.input<typeof removeExerciseSchema>,
): Promise<ActionResult<{ count: number }>> {
  try {
    const userId = await requireUserId();
    const { logId, exerciseId } = removeExerciseSchema.parse(input);
    const deleted = await db
      .delete(workoutSets)
      .where(
        and(
          eq(workoutSets.workoutLogId, logId),
          eq(workoutSets.exerciseId, exerciseId),
          inArray(workoutSets.workoutLogId, ownLogIds(userId)),
        ),
      )
      .returning({ id: workoutSets.id });
    return { ok: true, data: { count: deleted.length } };
  } catch (err) {
    return fail(err);
  }
}

/** Ghi chú buổi tập (lưu khi rời ô nhập). Tự tạo buổi tập nếu chưa có. */
export async function saveWorkoutNotes(input: z.input<typeof notesSchema>): Promise<ActionResult<{ logId: number }>> {
  try {
    const userId = await requireUserId();
    const data = notesSchema.parse(input);
    const logId = await ensureLog(userId, data.date);
    await db
      .update(workoutLogs)
      .set({ notes: data.notes || null })
      .where(and(eq(workoutLogs.id, logId), eq(workoutLogs.userId, userId)));
    return { ok: true, data: { logId } };
  } catch (err) {
    return fail(err);
  }
}
