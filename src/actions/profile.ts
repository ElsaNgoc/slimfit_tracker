"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLevelEnum, sexEnum, users, type User } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { currentYearInAppTz } from "@/lib/date";
import { calculateBmr, calculateTdee } from "@/lib/energy";

const updateProfileSchema = z.object({
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(25).max(350),
  targetWeightKg: z.number().min(25).max(350).nullish(),
  sex: z.enum(sexEnum.enumValues),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .refine((y) => currentYearInAppTz() - y >= 13, "Tuổi phải từ 13 trở lên."),
  activityLevel: z.enum(activityLevelEnum.enumValues),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

/** PUT — cập nhật hồ sơ và tính lại BMR / TDEE (Mifflin-St Jeor), lưu vào bảng users. */
export async function updateProfile(input: UpdateProfileInput): Promise<ActionResult<User>> {
  try {
    const userId = await requireUserId();
    const data = updateProfileSchema.parse(input);

    const bmr = calculateBmr({
      weightKg: data.weightKg,
      heightCm: data.heightCm,
      age: currentYearInAppTz() - data.birthYear,
      sex: data.sex,
    });
    const tdee = calculateTdee(bmr, data.activityLevel);

    const [user] = await db
      .update(users)
      .set({
        height: data.heightCm,
        weight: data.weightKg,
        targetWeight: data.targetWeightKg ?? null,
        sex: data.sex,
        birthYear: data.birthYear,
        activityLevel: data.activityLevel,
        bmr,
        tdee,
      })
      .where(eq(users.id, userId))
      .returning();

    refresh(); // render lại trang Hồ sơ với TDEE mới
    return { ok: true, data: user };
  } catch (err) {
    return toActionError(err);
  }
}
