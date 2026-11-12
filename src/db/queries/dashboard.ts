import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customFoods, dailyLogs, habitLogs, habits, nutritionLogs, users } from "@/db/schema";

/**
 * Dữ liệu cho Dashboard của ngày `date`: hồ sơ user, nhật ký ngày, bản ghi dinh dưỡng,
 * danh sách thói quen kèm trạng thái check của đúng ngày đó (chưa có log = chưa check),
 * từ điển món riêng của user (gộp với từ điển tĩnh ở client để tìm món).
 */
export async function getDashboardData(userId: string, date: string) {
  const [userRows, logRows, nutritionRows, habitRows, customFoodRows] = await db.batch([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.date, date)))
      .limit(1),
    db
      .select()
      .from(nutritionLogs)
      .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
      .orderBy(asc(nutritionLogs.createdAt), asc(nutritionLogs.id)),
    db
      .select({ id: habits.id, name: habits.name, completed: habitLogs.completed })
      .from(habits)
      .leftJoin(habitLogs, and(eq(habitLogs.habitId, habits.id), eq(habitLogs.date, date)))
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.createdAt), asc(habits.id)),
    db
      .select({
        id: customFoods.id,
        name: customFoods.name,
        calories: customFoods.calories,
        proteinG: customFoods.proteinG,
        carbsG: customFoods.carbsG,
        fatG: customFoods.fatG,
      })
      .from(customFoods)
      .where(eq(customFoods.userId, userId))
      .orderBy(desc(customFoods.createdAt), desc(customFoods.id)),
  ]);

  return {
    user: userRows[0] ?? null,
    dailyLog: logRows[0] ?? null,
    nutritionLogs: nutritionRows,
    customFoods: customFoodRows,
    habits: habitRows.map((h) => ({ id: h.id, name: h.name, completed: h.completed ?? false })),
  };
}
