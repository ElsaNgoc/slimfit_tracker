/**
 * Logic dinh dưỡng thuần (dùng được ở cả server và client).
 *   - Quy đổi: 1 g Protein / Carbs = 4 kcal, 1 g Fat = 9 kcal (Atwater). Chất xơ không tính calo riêng.
 *   - Chia mục tiêu calo ngày (TDEE − deficit) cho 4 bữa.
 *   - Mục tiêu macro theo % năng lượng.
 */

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MacroKey = "protein" | "carbs" | "fat";

/** Thứ tự hiển thị + nhãn + tỉ lệ calo gợi ý của từng bữa (tổng = 1). */
export const MEALS: { type: MealType; label: string; share: number }[] = [
  { type: "breakfast", label: "Sáng", share: 0.25 },
  { type: "lunch", label: "Trưa", share: 0.3 },
  { type: "dinner", label: "Tối", share: 0.3 },
  { type: "snack", label: "Phụ", share: 0.15 },
];

export const MEAL_TYPES = MEALS.map((m) => m.type) as [MealType, ...MealType[]];

export const KCAL_PER_GRAM: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };

/**
 * Tỉ lệ năng lượng từ macro cho giai đoạn giảm cân: protein cao để giữ cơ khi ăn thâm hụt.
 * Protein 30% · Carbs 40% · Fat 30%.
 */
export const MACRO_SPLIT: Record<MacroKey, number> = { protein: 0.3, carbs: 0.4, fat: 0.3 };

export type Macros = { proteinG: number; carbsG: number; fatG: number };
export type NutritionTotals = Macros & { calories: number; fiberG: number };

/** kcal từ gram macro, làm tròn số nguyên. */
export function caloriesFromMacros({ proteinG, carbsG, fatG }: Macros): number {
  return Math.round(
    proteinG * KCAL_PER_GRAM.protein + carbsG * KCAL_PER_GRAM.carbs + fatG * KCAL_PER_GRAM.fat,
  );
}

/** Calo gợi ý cho từng bữa; làm tròn sao cho tổng đúng bằng `calorieGoal` (phần dư dồn vào bữa Phụ). */
export function mealCalorieTargets(calorieGoal: number): Record<MealType, number> {
  const targets = {} as Record<MealType, number>;
  let assigned = 0;
  MEALS.forEach((meal, i) => {
    const value = i === MEALS.length - 1 ? calorieGoal - assigned : Math.round(calorieGoal * meal.share);
    targets[meal.type] = value;
    assigned += value;
  });
  return targets;
}

/** Mục tiêu gram macro mỗi ngày từ mục tiêu calo. */
export function macroGoals(calorieGoal: number): Macros {
  const grams = (k: MacroKey) => Math.round((calorieGoal * MACRO_SPLIT[k]) / KCAL_PER_GRAM[k]);
  return { proteinG: grams("protein"), carbsG: grams("carbs"), fatG: grams("fat") };
}

/** Cộng dồn calo + macro của danh sách bản ghi. */
export function sumNutrition(entries: readonly NutritionTotals[]): NutritionTotals {
  return entries.reduce<NutritionTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
      fiberG: acc.fiberG + e.fiberG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

/** % hoàn thành (không chặn trên 100 — UI tự xử lý phần vượt). null khi chưa có mục tiêu. */
export function percentOf(value: number, goal: number | null): number | null {
  if (!goal || goal <= 0) return null;
  return Math.round((value / goal) * 100);
}

/** Hiển thị gram: tối đa 1 chữ số thập phân, dấu phẩy kiểu VN. */
export function formatGram(g: number): string {
  return (Math.round(g * 10) / 10).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}
