"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customFoods, nutritionLogs, type CustomFood, type NutritionLog } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { MEAL_TYPES } from "@/lib/nutrition";
import { FOOD_GRAM_MAX, FOOD_NAME_MAX, foodNameKey, normalizeFoodName, per100FromPortion } from "@/lib/food-search";

const gram = z.number().min(0).max(2000);

/** Ngưỡng hợp lý cho số liệu / 100 g: chất béo nguyên chất ~900 kcal, tổng P + C + F không quá 100 g. */
const MAX_KCAL_PER_100G = 900;

const addNutritionLogSchema = z
  .object({
    date: z.iso.date(), // YYYY-MM-DD
    mealType: z.enum(MEAL_TYPES),
    foodName: z
      .string()
      .transform(normalizeFoodName)
      .pipe(z.string().min(1, "Nhập tên món ăn.").max(FOOD_NAME_MAX)),
    /** Khối lượng đã ăn (gram). Bắt buộc khi lưu vào từ điển (để quy về 100 g). */
    weightG: z.number().positive().max(FOOD_GRAM_MAX).nullish().transform((v) => v ?? null),
    calories: z.number().int().min(0).max(10000),
    proteinG: gram.default(0),
    carbsG: gram.default(0),
    fatG: gram.default(0),
    fiberG: gram.default(0),
    /** "Lưu món này vào từ điển của tôi" — đồng thời upsert vào custom_foods (số liệu quy về 100 g). */
    saveToDictionary: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    if (!d.saveToDictionary) return;
    if (d.weightG === null) {
      ctx.addIssue({ code: "custom", path: ["weightG"], message: "Nhập khối lượng (gram) để lưu vào từ điển." });
      return;
    }
    const per100 = per100FromPortion(d, d.weightG);
    if (per100.calories > MAX_KCAL_PER_100G || per100.proteinG + per100.carbsG + per100.fatG > 100.5) {
      ctx.addIssue({
        code: "custom",
        path: ["weightG"],
        message: "Số liệu quy ra 100 g không hợp lý — kiểm tra lại khối lượng.",
      });
    }
  });

export type AddNutritionLogInput = z.input<typeof addNutritionLogSchema>;
export type AddNutritionLogResult = { log: NutritionLog; customFood: CustomFood | null };

/**
 * POST — thêm 1 món vào bữa `mealType` của ngày `date`.
 * `saveToDictionary` → thêm luôn vào từ điển riêng (trùng tên thì cập nhật số liệu) trong cùng 1 batch (atomic).
 */
export async function addNutritionLog(input: AddNutritionLogInput): Promise<ActionResult<AddNutritionLogResult>> {
  try {
    const userId = await requireUserId();
    const { saveToDictionary, ...data } = addNutritionLogSchema.parse(input);
    const insertLog = db
      .insert(nutritionLogs)
      .values({ userId, ...data })
      .returning();

    if (!saveToDictionary || data.weightG === null) {
      const [log] = await insertLog;
      return { ok: true, data: { log, customFood: null } };
    }

    const per100 = per100FromPortion(data, data.weightG);
    const [[log], [customFood]] = await db.batch([
      insertLog,
      db
        .insert(customFoods)
        .values({ userId, name: data.foodName, nameKey: foodNameKey(data.foodName), ...per100 })
        .onConflictDoUpdate({
          target: [customFoods.userId, customFoods.nameKey],
          set: {
            name: sql`excluded.name`,
            calories: sql`excluded.calories`,
            proteinG: sql`excluded.protein`,
            carbsG: sql`excluded.carbs`,
            fatG: sql`excluded.fat`,
          },
        })
        .returning(),
    ]);
    return { ok: true, data: { log, customFood } };
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Lỗi nghiệp vụ (vd thiếu khối lượng khi lưu từ điển) → hiện đúng câu tiếng Việt thay vì "Dữ liệu không hợp lệ."
      const custom = err.issues.find((i) => i.code === "custom");
      if (custom) return { ok: false, error: custom.message, fieldErrors: { [String(custom.path[0])]: [custom.message] } };
    }
    return toActionError(err);
  }
}

/** DELETE — xoá 1 bản ghi dinh dưỡng của chính user. */
export async function deleteNutritionLog(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const logId = z.number().int().positive().parse(id);
    const deleted = await db
      .delete(nutritionLogs)
      .where(and(eq(nutritionLogs.id, logId), eq(nutritionLogs.userId, userId)))
      .returning({ id: nutritionLogs.id });
    if (deleted.length === 0) return { ok: false, error: "Không tìm thấy bản ghi." };
    return { ok: true, data: deleted[0] };
  } catch (err) {
    return toActionError(err);
  }
}
