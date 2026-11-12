import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customFoods } from "@/db/schema";

/** Các cột client cần (khớp CustomFoodRow trong src/lib/food-search.ts) — không gửi user_id / name_key xuống trình duyệt. */
export const customFoodColumns = {
  id: customFoods.id,
  name: customFoods.name,
  calories: customFoods.calories,
  proteinG: customFoods.proteinG,
  carbsG: customFoods.carbsG,
  fatG: customFoods.fatG,
};

/** Từ điển món riêng của user, sắp theo tên (trang Hồ sơ → "Từ điển món ăn của tôi"). */
export function getCustomFoods(userId: string) {
  return db
    .select(customFoodColumns)
    .from(customFoods)
    .where(eq(customFoods.userId, userId))
    .orderBy(asc(customFoods.nameKey), desc(customFoods.id));
}
