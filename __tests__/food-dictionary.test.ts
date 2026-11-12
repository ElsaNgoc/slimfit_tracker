import { describe, expect, it } from "vitest";
import { FOOD_GROUP_LABEL, VIETNAMESE_FOODS } from "@/lib/vietnameseFoods";
import {
  BUILTIN_FOOD_ITEMS,
  customFoodItem,
  foldVietnamese,
  foodNameKey,
  normalizeFoodName,
  per100FromPortion,
  scaleNutrients,
  searchFoods,
} from "@/lib/food-search";

// ---------- Dữ liệu tĩnh ----------

describe("lib/vietnameseFoods", () => {
  it("80–110 món, đủ các nhóm Tinh bột / Đạm / Rau củ / Gia vị (+ Sữa, Trái cây)", () => {
    expect(VIETNAMESE_FOODS.length).toBeGreaterThanOrEqual(80);
    expect(VIETNAMESE_FOODS.length).toBeLessThanOrEqual(110);
    for (const group of Object.keys(FOOD_GROUP_LABEL)) {
      expect(VIETNAMESE_FOODS.filter((f) => f.group === group).length, group).toBeGreaterThanOrEqual(5);
    }
    // Các món cơ bản bắt buộc phải có
    for (const q of ["gạo", "bún", "bánh phở", "miến", "khoai", "bắp bò", "ức gà", "ba chỉ", "trứng", "tôm", "đậu phụ", "rau muống", "súp lơ", "dầu ăn", "nước mắm"]) {
      expect(searchFoods(q, []).length, q).toBeGreaterThan(0);
    }
  });

  it("id và tên không trùng (tên so không phân biệt hoa thường)", () => {
    expect(new Set(VIETNAMESE_FOODS.map((f) => f.id)).size).toBe(VIETNAMESE_FOODS.length);
    expect(new Set(VIETNAMESE_FOODS.map((f) => foodNameKey(f.name))).size).toBe(VIETNAMESE_FOODS.length);
    for (const f of VIETNAMESE_FOODS) expect(f.id, f.name).toMatch(/^vn-[a-z0-9-]+$/);
  });

  it("số liệu / 100 g hợp lý: P + C + F ≤ 100 g, calo ≈ P×4 + C×4 + F×9 (bắt lỗi gõ nhầm)", () => {
    for (const f of VIETNAMESE_FOODS) {
      const label = `${f.name}: ${f.calories} kcal, P ${f.proteinG} C ${f.carbsG} F ${f.fatG}`;
      for (const n of [f.calories, f.proteinG, f.carbsG, f.fatG]) expect(n, label).toBeGreaterThanOrEqual(0);
      expect(f.proteinG + f.carbsG + f.fatG, label).toBeLessThanOrEqual(100);
      expect(f.calories, label).toBeLessThanOrEqual(902);
      const atwater = f.proteinG * 4 + f.carbsG * 4 + f.fatG * 9;
      // Carbs USDA gồm cả chất xơ (ngô, ổi), hạt / dầu có hệ số Atwater riêng → cho lệch tối đa 20 kcal hoặc 15%
      expect(Math.abs(f.calories - atwater), label).toBeLessThanOrEqual(Math.max(20, f.calories * 0.15));
    }
  });
});

// ---------- Tìm kiếm ----------

const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("searchFoods", () => {
  it("gõ có dấu hay không dấu, hoa hay thường đều ra cùng kết quả", () => {
    const a = names(searchFoods("thịt bò", []));
    expect(a[0]).toBe("Thịt bò nạc (sống)");
    expect(names(searchFoods("THIT BO", []))).toEqual(a);
    expect(names(searchFoods("  thit   bo ", []))).toEqual(a);
  });

  it("tìm theo tên gọi khác vùng miền (heo ↔ lợn, đậu hũ ↔ đậu phụ, bắp ↔ ngô)", () => {
    expect(names(searchFoods("thịt lợn", []))).toContain("Thịt heo nạc (sống)");
    expect(names(searchFoods("đậu hũ", []))[0]).toBe("Đậu phụ");
    expect(names(searchFoods("bắp ngô", []))).toContain("Ngô ngọt (luộc)");
    expect(names(searchFoods("dua leo", []))).toContain("Dưa chuột");
  });

  it("xếp hạng: khớp đầu tên trước khớp giữa tên", () => {
    const res = names(searchFoods("trứng", []));
    expect(res.slice(0, 3).every((n) => n.startsWith("Trứng"))).toBe(true);
    expect(res).toContain("Lòng trắng trứng gà");
    expect(res.indexOf("Lòng trắng trứng gà")).toBeGreaterThan(res.indexOf("Trứng gà"));
  });

  it("món của tôi được gộp, đứng trước khi cùng độ khớp; trùng tên thì thay món có sẵn", () => {
    const mine = [
      customFoodItem({ id: 1, name: "Cơm tấm sườn", calories: 180, proteinG: 9, carbsG: 22, fatG: 6 }),
      customFoodItem({ id: 2, name: "đậu phụ", calories: 80, proteinG: 8, carbsG: 2, fatG: 4.5 }),
    ];
    const com = searchFoods("com", mine);
    expect(com[0]).toMatchObject({ name: "Cơm tấm sườn", source: "custom", tag: "Món của tôi", id: "custom-1" });
    expect(names(com)).toContain("Cơm trắng (chín)");

    const tofu = searchFoods("đậu phụ", mine);
    expect(tofu[0]).toMatchObject({ source: "custom", per100: { calories: 80 } });
    expect(tofu.filter((f) => foodNameKey(f.name) === "đậu phụ")).toHaveLength(1);
  });

  it("trống / không khớp → []; giới hạn số gợi ý", () => {
    expect(searchFoods("   ", [])).toEqual([]);
    expect(searchFoods("pizza hải sản", [])).toEqual([]);
    expect(searchFoods("a", [], BUILTIN_FOOD_ITEMS, 5)).toHaveLength(5);
  });
});

// ---------- Quy đổi ----------

describe("quy đổi gram", () => {
  it("scaleNutrients nhân từ mốc 100 g (150 g ức gà chín)", () => {
    const chicken = BUILTIN_FOOD_ITEMS.find((f) => f.name === "Ức gà bỏ da (chín)")!;
    expect(scaleNutrients(chicken.per100, 100, 150)).toEqual({ calories: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4 });
    expect(scaleNutrients(chicken.per100, 100, 0).calories).toBe(0);
  });

  it("per100FromPortion: phần 250 g / 500 kcal → 200 kcal / 100 g", () => {
    expect(per100FromPortion({ calories: 500, proteinG: 25, carbsG: 60, fatG: 15 }, 250)).toEqual({
      calories: 200,
      proteinG: 10,
      carbsG: 24,
      fatG: 6,
    });
  });

  it("foldVietnamese bỏ dấu; foodNameKey giữ dấu (Bơ ≠ Bò)", () => {
    expect(foldVietnamese("Đậu  PHỤ")).toBe("dau phu");
    expect(normalizeFoodName("  Bún   chả ")).toBe("Bún chả");
    expect(foodNameKey(" Bún  CHẢ ")).toBe("bún chả");
    expect(foodNameKey("Bơ")).not.toBe(foodNameKey("Bò"));
  });
});
