/**
 * Từ điển dinh dưỡng động — logic thuần (dùng được ở cả server và client):
 *   - Gộp 2 nguồn: từ điển tĩnh (src/lib/vietnameseFoods.ts) + món user tự lưu (bảng custom_foods).
 *   - Tìm kiếm không phân biệt dấu / hoa thường, có tên gọi khác (heo / lợn…), xếp hạng theo độ khớp.
 *   - Quy đổi calo / macro theo số gram (mọi nguồn đều tính trên 100 g).
 */
import { FOOD_GROUP_LABEL, VIETNAMESE_FOODS, type VietnameseFood } from "./vietnameseFoods";

export type FoodNutrients = { calories: number; proteinG: number; carbsG: number; fatG: number };

/** 1 món trong từ điển — giá trị dinh dưỡng `per100` luôn tính trên 100 g. */
export type FoodItem = {
  /** "vn-…" cho món có sẵn, "custom-<id>" cho món user tự lưu. */
  id: string;
  name: string;
  source: "builtin" | "custom";
  /** Nhãn nhóm hiển thị trong gợi ý ("Đạm", "Món của tôi"…). */
  tag: string;
  aliases: string[];
  per100: FoodNutrients;
};

/** Hình dạng tối thiểu của 1 dòng custom_foods mà client cần. */
export type CustomFoodRow = {
  id: number;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export const FOOD_GRAM_MAX = 5000;
export const FOOD_NAME_MAX = 120;
export const FOOD_SUGGESTION_LIMIT = 8;

/** Bỏ dấu + chữ thường + gộp khoảng trắng: "Thịt  BÒ" → "thit bo". Chỉ dùng để TÌM, không dùng làm khoá trùng. */
export function foldVietnamese(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Tên món lưu vào DB: gộp khoảng trắng thừa. */
export function normalizeFoodName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Khoá chống trùng món trong từ điển của 1 user: chữ thường nhưng GIỮ dấu
 * ("Bơ" và "Bò" là 2 món khác nhau, bỏ dấu sẽ gộp nhầm).
 */
export function foodNameKey(name: string): string {
  return normalizeFoodName(name).normalize("NFC").toLowerCase();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Calo / macro cho `grams` gram, từ giá trị gốc ứng với `basisG` gram. Calo làm tròn số nguyên, macro 1 chữ số. */
export function scaleNutrients(nutrients: FoodNutrients, basisG: number, grams: number): FoodNutrients {
  if (!(basisG > 0) || !(grams > 0)) return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const k = grams / basisG;
  return {
    calories: Math.round(nutrients.calories * k),
    proteinG: round1(nutrients.proteinG * k),
    carbsG: round1(nutrients.carbsG * k),
    fatG: round1(nutrients.fatG * k),
  };
}

export function builtinFoodItem(f: VietnameseFood): FoodItem {
  return {
    id: f.id,
    name: f.name,
    source: "builtin",
    tag: FOOD_GROUP_LABEL[f.group],
    aliases: f.aliases ?? [],
    per100: { calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG },
  };
}

export function customFoodItem(f: CustomFoodRow): FoodItem {
  return {
    id: `custom-${f.id}`,
    name: f.name,
    source: "custom",
    tag: "Món của tôi",
    aliases: [],
    per100: { calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG },
  };
}

export const BUILTIN_FOOD_ITEMS: FoodItem[] = VIETNAMESE_FOODS.map(builtinFoodItem);

/**
 * Điểm khớp của 1 tên với truy vấn (đã fold). 0 = không khớp.
 *   4 — trùng khớp hoàn toàn · 3 — tên bắt đầu bằng truy vấn · 2 — mọi từ của truy vấn là đầu một từ trong tên
 *   1 — mọi từ của truy vấn đều xuất hiện trong tên (ở bất kỳ đâu)
 */
function matchScore(name: string, q: string, qWords: string[]): number {
  const n = foldVietnamese(name);
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  const nameWords = n.split(/[\s/(),.-]+/).filter(Boolean);
  if (qWords.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 2;
  if (qWords.every((w) => n.includes(w))) return 1;
  return 0;
}

/**
 * Tìm trong từ điển gộp (món của tôi + món có sẵn). Xếp theo điểm khớp (tên chính hoặc tên gọi khác),
 * cùng điểm thì món của tôi đứng trước, rồi tên ngắn hơn (khớp sát hơn) đứng trước.
 * Món của tôi trùng tên (không phân biệt hoa thường) với món có sẵn sẽ thay thế món có sẵn.
 */
export function searchFoods(
  query: string,
  customFoods: readonly FoodItem[],
  builtin: readonly FoodItem[] = BUILTIN_FOOD_ITEMS,
  limit = FOOD_SUGGESTION_LIMIT,
): FoodItem[] {
  const q = foldVietnamese(query);
  if (!q) return [];
  const qWords = q.split(" ");

  const customKeys = new Set(customFoods.map((f) => foodNameKey(f.name)));
  const pool = [...customFoods, ...builtin.filter((f) => !customKeys.has(foodNameKey(f.name)))];

  return pool
    .map((item) => ({
      item,
      score: Math.max(matchScore(item.name, q, qWords), ...item.aliases.map((a) => matchScore(a, q, qWords))),
    }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.item.source === "custom") - Number(a.item.source === "custom") ||
        a.item.name.length - b.item.name.length,
    )
    .slice(0, limit)
    .map((r) => r.item);
}

/** Quy số liệu của 1 phần ăn (`grams` gram) về mốc 100 g để lưu vào từ điển. */
export function per100FromPortion(portion: FoodNutrients, grams: number): FoodNutrients {
  return scaleNutrients(portion, grams, 100);
}
