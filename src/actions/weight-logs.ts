"use server";

import { desc, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { users, weightLogs } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { currentYearInAppTz, todayInAppTz } from "@/lib/date";
import { energyFromProfile } from "@/lib/energy";
import { WEIGHT_MAX_KG, WEIGHT_MIN_KG, type WeightPoint } from "@/lib/weight";

const upsertWeightLogSchema = z.object({
  // So chuỗi YYYY-MM-DD theo giờ VN: không nhận ngày tương lai
  date: z.iso.date().refine((d) => d <= todayInAppTz(), "Không thể nhập cân nặng cho ngày trong tương lai."),
  weightKg: z
    .number()
    .min(WEIGHT_MIN_KG, `Cân nặng từ ${WEIGHT_MIN_KG} đến ${WEIGHT_MAX_KG} kg.`)
    .max(WEIGHT_MAX_KG, `Cân nặng từ ${WEIGHT_MIN_KG} đến ${WEIGHT_MAX_KG} kg.`)
    .transform((n) => Math.round(n * 10) / 10),
});

export type UpsertWeightLogInput = z.input<typeof upsertWeightLogSchema>;

/**
 * Ghi cân nặng của 1 ngày (đã có thì cập nhật). Nếu là ngày mới nhất trong lịch sử → đồng bộ users.weight
 * và tính lại BMR / TDEE (khi hồ sơ đủ thông tin) trong cùng 1 batch, để mục tiêu calo luôn theo cân nặng hiện tại.
 */
export async function upsertWeightLog(input: UpsertWeightLogInput): Promise<ActionResult<WeightPoint>> {
  try {
    const userId = await requireUserId();
    const { date, weightKg } = upsertWeightLogSchema.parse(input);

    const [[user], [latest]] = await db.batch([
      db.select().from(users).where(eq(users.id, userId)).limit(1),
      db
        .select({ date: weightLogs.date })
        .from(weightLogs)
        .where(eq(weightLogs.userId, userId))
        .orderBy(desc(weightLogs.date))
        .limit(1),
    ]);

    const upsert = db
      .insert(weightLogs)
      .values({ userId, date, weightKg })
      .onConflictDoUpdate({ target: [weightLogs.userId, weightLogs.date], set: { weightKg: sql`excluded.weight_kg` } });

    const isLatest = !latest || date >= latest.date;
    if (isLatest && user) {
      const energy = energyFromProfile(
        { weightKg, heightCm: user.height, sex: user.sex, birthYear: user.birthYear, activityLevel: user.activityLevel },
        currentYearInAppTz(),
      );
      await db.batch([upsert, db.update(users).set({ weight: weightKg, ...energy }).where(eq(users.id, userId))]);
    } else {
      await upsert;
    }

    refresh(); // trang Hồ sơ vẽ lại biểu đồ + TDEE mới
    return { ok: true, data: { date, weightKg } };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      if (issue?.path[0] === "date" || issue?.path[0] === "weightKg") return { ok: false, error: issue.message };
    }
    return toActionError(err);
  }
}
