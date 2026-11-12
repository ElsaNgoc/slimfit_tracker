"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customFoods } from "@/db/schema";
import { customFoodColumns } from "@/db/queries/custom-foods";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import {
  FOOD_NAME_MAX,
  MAX_KCAL_PER_100G,
  MAX_MACRO_PER_100G,
  foodNameKey,
  normalizeFoodName,
  per100Problem,
  type CustomFoodRow,
} from "@/lib/food-search";

const id = z.number().int().positive();
const macro = z.number().min(0).max(MAX_MACRO_PER_100G);

const updateCustomFoodSchema = z
  .object({
    id,
    name: z
      .string()
      .transform(normalizeFoodName)
      .pipe(z.string().min(1, "Nhập tên món ăn.").max(FOOD_NAME_MAX)),
    // Mọi chỉ số tính trên 100 g
    calories: z.number().int().min(0).max(MAX_KCAL_PER_100G),
    proteinG: macro,
    carbsG: macro,
    fatG: macro,
  })
  .superRefine((d, ctx) => {
    const problem = per100Problem(d);
    if (problem) ctx.addIssue({ code: "custom", path: ["calories"], message: problem });
  });

export type UpdateCustomFoodInput = z.input<typeof updateCustomFoodSchema>;

const DUPLICATE_NAME = "Từ điển đã có một món khác cùng tên.";

/** Postgres unique_violation (23505) — driver Neon có thể bọc lỗi gốc trong `cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** PATCH — sửa tên / số liệu (trên 100 g) của 1 món trong từ điển riêng. */
export async function updateCustomFood(input: UpdateCustomFoodInput): Promise<ActionResult<CustomFoodRow>> {
  try {
    const userId = await requireUserId();
    const { id: foodId, ...data } = updateCustomFoodSchema.parse(input);
    const nameKey = foodNameKey(data.name);

    // Đổi tên trùng (không phân biệt hoa thường) với món khác → báo rõ thay vì lỗi DB chung chung
    const [clash] = await db
      .select({ id: customFoods.id })
      .from(customFoods)
      .where(and(eq(customFoods.userId, userId), eq(customFoods.nameKey, nameKey), ne(customFoods.id, foodId)))
      .limit(1);
    if (clash) return { ok: false, error: DUPLICATE_NAME, fieldErrors: { name: [DUPLICATE_NAME] } };

    const [food] = await db
      .update(customFoods)
      .set({ ...data, nameKey })
      .where(and(eq(customFoods.id, foodId), eq(customFoods.userId, userId)))
      .returning(customFoodColumns);
    if (!food) return { ok: false, error: "Không tìm thấy món này trong từ điển." };
    return { ok: true, data: food };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: DUPLICATE_NAME, fieldErrors: { name: [DUPLICATE_NAME] } };
    if (err instanceof z.ZodError) {
      const custom = err.issues.find((i) => i.code === "custom");
      if (custom) return { ok: false, error: custom.message };
    }
    return toActionError(err);
  }
}

/** DELETE — xoá 1 món khỏi từ điển riêng. Bản ghi bữa ăn đã lưu trước đó không bị ảnh hưởng (lưu số liệu riêng). */
export async function deleteCustomFood(foodId: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const parsed = id.parse(foodId);
    const deleted = await db
      .delete(customFoods)
      .where(and(eq(customFoods.id, parsed), eq(customFoods.userId, userId)))
      .returning({ id: customFoods.id });
    if (deleted.length === 0) return { ok: false, error: "Không tìm thấy món này trong từ điển." };
    return { ok: true, data: deleted[0] };
  } catch (err) {
    return toActionError(err);
  }
}
