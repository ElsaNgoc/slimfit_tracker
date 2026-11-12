/**
 * Tính năng lượng theo công thức Mifflin-St Jeor (1990).
 *   BMR (nam) = 10·kg + 6.25·cm − 5·tuổi + 5
 *   BMR (nữ)  = 10·kg + 6.25·cm − 5·tuổi − 161
 *   TDEE      = BMR × hệ số vận động
 * Hàm thuần (không phụ thuộc server/client) để dùng được ở cả hai phía.
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export const ACTIVITY_LEVELS: Record<ActivityLevel, { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: "Ít vận động (ngồi nhiều)" },
  light: { factor: 1.375, label: "Nhẹ (tập 1–3 buổi/tuần)" },
  moderate: { factor: 1.55, label: "Vừa (tập 3–5 buổi/tuần)" },
  active: { factor: 1.725, label: "Nhiều (tập 6–7 buổi/tuần)" },
  very_active: { factor: 1.9, label: "Rất nhiều (lao động nặng / tập 2 lần/ngày)" },
};

/** Mức thâm hụt calo mỗi ngày để giảm cân. */
export const CALORIE_DEFICIT = 600;

export type BmrInput = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
};

export function calculateBmr({ weightKg, heightCm, age, sex }: BmrInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_LEVELS[activityLevel].factor);
}

/** Mục tiêu calo/ngày = TDEE − 600 kcal. */
export function calculateCalorieGoal(tdee: number): number {
  return Math.max(0, tdee - CALORIE_DEFICIT);
}

export function ageFromBirthYear(birthYear: number, today: Date = new Date()): number {
  return today.getFullYear() - birthYear;
}

/**
 * BMR + TDEE từ hồ sơ; null khi hồ sơ chưa đủ thông tin (thiếu chiều cao / giới tính / năm sinh / mức vận động).
 * Dùng khi cân nặng đổi từ nơi khác (biểu đồ cân nặng) để TDEE luôn khớp cân nặng mới nhất.
 */
export function energyFromProfile(
  p: {
    weightKg: number;
    heightCm: number | null;
    sex: Sex | null;
    birthYear: number | null;
    activityLevel: ActivityLevel | null;
  },
  currentYear: number,
): { bmr: number; tdee: number } | null {
  if (!p.heightCm || !p.sex || !p.birthYear || !p.activityLevel) return null;
  const bmr = calculateBmr({ weightKg: p.weightKg, heightCm: p.heightCm, age: currentYear - p.birthYear, sex: p.sex });
  return { bmr, tdee: calculateTdee(bmr, p.activityLevel) };
}
