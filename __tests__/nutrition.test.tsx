import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/nutrition-logs", () => ({ addNutritionLog: vi.fn(), deleteNutritionLog: vi.fn() }));

import { addNutritionLog, deleteNutritionLog } from "@/actions/nutrition-logs";
import type { NutritionLog } from "@/db/schema";
import {
  MEALS,
  caloriesFromMacros,
  macroGoals,
  mealCalorieTargets,
  percentOf,
  sumNutrition,
} from "@/lib/nutrition";
import { NutritionTracker, type NutritionEntry } from "@/components/nutrition/NutritionTracker";

const add = vi.mocked(addNutritionLog);
const del = vi.mocked(deleteNutritionLog);

// ---------- lib/nutrition ----------

describe("lib/nutrition", () => {
  it("tỉ lệ 4 bữa: Sáng 25% · Trưa 30% · Tối 30% · Phụ 15% (tổng 100%)", () => {
    expect(MEALS.map((m) => [m.label, m.share])).toEqual([
      ["Sáng", 0.25],
      ["Trưa", 0.3],
      ["Tối", 0.3],
      ["Phụ", 0.15],
    ]);
    expect(MEALS.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1);
  });

  it("chia mục tiêu calo cho 4 bữa, tổng luôn đúng bằng mục tiêu", () => {
    expect(mealCalorieTargets(2000)).toEqual({ breakfast: 500, lunch: 600, dinner: 600, snack: 300 });
    for (const goal of [1333, 1517, 1999, 0]) {
      const t = mealCalorieTargets(goal);
      expect(t.breakfast + t.lunch + t.dinner + t.snack).toBe(goal);
    }
  });

  it("quy đổi macro: Protein / Carbs 4 kcal/g, Fat 9 kcal/g", () => {
    expect(caloriesFromMacros({ proteinG: 1, carbsG: 0, fatG: 0 })).toBe(4);
    expect(caloriesFromMacros({ proteinG: 0, carbsG: 1, fatG: 0 })).toBe(4);
    expect(caloriesFromMacros({ proteinG: 0, carbsG: 0, fatG: 1 })).toBe(9);
    expect(caloriesFromMacros({ proteinG: 25, carbsG: 40.5, fatG: 12 })).toBe(100 + 162 + 108);
  });

  it("mục tiêu macro = P 30% / C 40% / F 30% năng lượng", () => {
    // 1800 kcal → P 540/4 = 135 g, C 720/4 = 180 g, F 540/9 = 60 g
    expect(macroGoals(1800)).toEqual({ proteinG: 135, carbsG: 180, fatG: 60 });
  });

  it("sumNutrition + percentOf", () => {
    const total = sumNutrition([
      { calories: 300, proteinG: 20, carbsG: 30, fatG: 10, fiberG: 2 },
      { calories: 200, proteinG: 5.5, carbsG: 0, fatG: 0, fiberG: 1 },
    ]);
    expect(total).toEqual({ calories: 500, proteinG: 25.5, carbsG: 30, fatG: 10, fiberG: 3 });
    expect(percentOf(500, 2000)).toBe(25);
    expect(percentOf(2500, 2000)).toBe(125);
    expect(percentOf(500, null)).toBeNull();
  });
});

// ---------- NutritionTracker ----------

const DATE = "2026-11-12";
const GOAL = 1800; // P 135 g · C 180 g · F 60 g; Sáng 450 · Trưa 540 · Tối 540 · Phụ 270

function savedLog(partial: Partial<NutritionLog> & Pick<NutritionLog, "mealType" | "calories">): NutritionLog {
  return {
    id: Math.floor(Math.random() * 1e6),
    userId: "user_1",
    date: DATE,
    foodName: "",
    weightG: null,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    createdAt: new Date(),
    ...partial,
  };
}

const entry = (e: Partial<NutritionEntry> & Pick<NutritionEntry, "id" | "mealType" | "calories">): NutritionEntry => ({
  foodName: "Món",
  weightG: null,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  ...e,
});

const ring = (name: string) => screen.getByRole("progressbar", { name });
const meal = (label: string) => screen.getByRole("region", { name: label });

async function openModal(user: ReturnType<typeof userEvent.setup>, mealLabel: string) {
  await user.click(screen.getByRole("button", { name: `Thêm món vào bữa ${mealLabel}` }));
  return screen.getByRole("dialog", { name: `Thêm món · Bữa ${mealLabel}` });
}

const BUN_CHA = { id: 7, name: "Bún chả Hà Nội", calories: 200, proteinG: 10, carbsG: 24, fatG: 6 };

describe("NutritionTracker", () => {
  beforeEach(() => {
    add.mockImplementation(async (input) => ({
      ok: true,
      data: {
        log: savedLog({
          mealType: input.mealType,
          foodName: input.foodName,
          weightG: input.weightG ?? null,
          calories: input.calories,
          proteinG: input.proteinG ?? 0,
          carbsG: input.carbsG ?? 0,
          fatG: input.fatG ?? 0,
        }),
        customFood: input.saveToDictionary
          ? { ...BUN_CHA, name: input.foodName, userId: "user_1", nameKey: input.foodName.toLowerCase(), createdAt: new Date() }
          : null,
      },
    }));
  });

  it("4 thẻ bữa ăn với calo gợi ý chia từ mục tiêu ngày + nút Thêm món", () => {
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    expect(within(meal("Sáng")).getByText(/Gợi ý 450 kcal · 25%/)).toBeInTheDocument();
    expect(within(meal("Trưa")).getByText(/Gợi ý 540 kcal · 30%/)).toBeInTheDocument();
    expect(within(meal("Tối")).getByText(/Gợi ý 540 kcal · 30%/)).toBeInTheDocument();
    expect(within(meal("Phụ")).getByText(/Gợi ý 270 kcal · 15%/)).toBeInTheDocument();
    expect(within(meal("Sáng")).getByRole("button", { name: "Thêm món vào bữa Sáng" })).toHaveTextContent("Thêm món");
  });

  it("vòng tròn hiển thị % từ dữ liệu có sẵn; thẻ bữa liệt kê tên món, gram, calo", () => {
    const initial = [
      entry({ id: 1, mealType: "breakfast", foodName: "Phở bò", weightG: 500, calories: 450, proteinG: 27, carbsG: 45, fatG: 18, fiberG: 4 }),
      entry({ id: 2, mealType: "breakfast", foodName: "", calories: 0 }),
    ];
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={initial} />);
    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "450 / 1.800 kcal (25%)");
    expect(ring("Protein")).toHaveAttribute("aria-valuetext", "27 / 135 g (20%)");
    expect(ring("Carbs")).toHaveAttribute("aria-valuetext", "45 / 180 g (25%)");
    expect(ring("Fat")).toHaveAttribute("aria-valuetext", "18 / 60 g (30%)");

    const items = within(meal("Sáng")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Phở bò");
    expect(items[0]).toHaveTextContent("500 g · P 27 · C 45 · F 18");
    expect(items[0]).toHaveTextContent("450 kcal");
    expect(items[1]).toHaveTextContent("Món chưa đặt tên"); // bản ghi cũ chưa có tên
  });

  it("Tìm món (từ điển tĩnh): gõ không dấu → gợi ý → chọn → 150 g → macro tự nhân → lưu, thẻ + vòng tròn cập nhật", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    const dialog = await openModal(user, "Trưa");

    expect(within(dialog).getByRole("tab", { name: "Tìm món" })).toHaveAttribute("aria-selected", "true");
    const box = within(dialog).getByRole("combobox", { name: "Tìm món ăn" });
    expect(box).toHaveFocus();
    await user.type(box, "uc ga");

    const options = within(dialog).getAllByRole("option");
    expect(options.map((o) => within(o).getByText(/Ức gà/).textContent)).toEqual([
      "Ức gà bỏ da (sống)",
      "Ức gà bỏ da (chín)",
    ]);
    expect(options[1]).toHaveTextContent("165 kcal/100g");
    expect(options[1]).toHaveTextContent("Đạm");

    await user.click(options[1]);
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    const grams = within(dialog).getByLabelText("Số lượng (gram)");
    expect(grams).toHaveValue("100");
    expect(within(dialog).getByTestId("food-calories")).toHaveTextContent("165");

    await user.clear(grams);
    await user.type(grams, "150");
    expect(within(dialog).getByTestId("food-calories")).toHaveTextContent("248");
    expect(within(dialog).getByTestId("food-protein")).toHaveTextContent("46,5");
    expect(within(dialog).getByTestId("food-carbs")).toHaveTextContent("0");
    expect(within(dialog).getByTestId("food-fat")).toHaveTextContent("5,4");

    // Nút chọn nhanh
    await user.click(within(dialog).getByRole("button", { name: "200 g" }));
    expect(grams).toHaveValue("200");
    expect(within(dialog).getByTestId("food-calories")).toHaveTextContent("330");
    await user.clear(grams);
    await user.type(grams, "150");

    await user.click(within(dialog).getByRole("button", { name: "Lưu vào bữa Trưa" }));
    expect(add).toHaveBeenCalledWith({
      date: DATE,
      mealType: "lunch",
      foodName: "Ức gà bỏ da (chín)",
      weightG: 150,
      calories: 248,
      proteinG: 46.5,
      carbsG: 0,
      fatG: 5.4,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "248 / 1.800 kcal (14%)");
    await waitFor(() => expect(screen.getByTestId("meal-kcal-lunch")).toHaveTextContent("248"));
    expect(within(meal("Trưa")).getByText("Ức gà bỏ da (chín)")).toBeInTheDocument();
    expect(within(meal("Trưa")).getByText(/150 g · P 46,5/)).toBeInTheDocument();
  });

  it("tìm bằng bàn phím: ↓ / Enter chọn món; gram trống → báo lỗi; Đổi món quay lại ô tìm", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    const dialog = await openModal(user, "Sáng");
    const box = within(dialog).getByRole("combobox");

    await user.type(box, "trứng");
    const options = within(dialog).getAllByRole("option");
    expect(box).toHaveAttribute("aria-activedescendant", options[0].id);
    await user.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-activedescendant", options[1].id);
    const second = within(options[1]).getByText(/Trứng/).textContent;
    await user.keyboard("{Enter}");
    expect(box).toHaveValue(second);
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // Enter không submit / đóng modal

    await user.clear(within(dialog).getByLabelText("Số lượng (gram)"));
    expect(within(dialog).getByTestId("food-calories")).toHaveTextContent("–");
    await user.click(within(dialog).getByRole("button", { name: "Lưu vào bữa Sáng" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập số gram từ 1 đến 5.000.");
    expect(add).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Đổi món" }));
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    expect(within(dialog).queryByLabelText("Số lượng (gram)")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Lưu vào bữa Sáng" })).toBeDisabled();
  });

  it("món của tôi (custom_foods) được gộp vào kết quả, có nhãn riêng, đứng đầu", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} initialCustomFoods={[BUN_CHA]} />);
    const dialog = await openModal(user, "Tối");
    expect(within(dialog).getByText(/\+ 1 món của bạn/)).toBeInTheDocument();

    // "bú" khớp đầu tên của cả Bún chả (của tôi), Bún tươi, Bưởi → cùng điểm thì món của tôi đứng trước
    await user.type(within(dialog).getByRole("combobox"), "bú");
    const options = within(dialog).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Bún chả Hà Nội");
    expect(options[0]).toHaveTextContent("Món của tôi");
    expect(options.some((o) => o.textContent?.includes("Bún tươi"))).toBe(true);
  });

  it("Tự nhập + tick 'Lưu vào từ điển' → gửi saveToDictionary, xem trước số liệu / 100 g; lần sau tìm được ngay", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    let dialog = await openModal(user, "Trưa");
    await user.click(within(dialog).getByRole("tab", { name: "Tự nhập" }));

    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), "Bún chả Hà Nội");
    await user.type(within(dialog).getByLabelText(/^Calories/), "500");
    await user.type(within(dialog).getByLabelText("Protein (g)"), "25");
    await user.type(within(dialog).getByLabelText("Carbs (g)"), "60");
    await user.type(within(dialog).getByLabelText("Fat (g)"), "15");

    const remember = within(dialog).getByRole("checkbox", { name: "Lưu món này vào từ điển của tôi" });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    expect(within(dialog).getByText("Nhập khối lượng phần ăn để quy đổi số liệu về 100 g.")).toBeInTheDocument();

    // Thiếu khối lượng → chặn ở client
    await user.click(within(dialog).getByRole("button", { name: "Lưu vào bữa Trưa" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập khối lượng (gram) để lưu vào từ điển.");
    expect(add).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^Khối lượng/), "250");
    expect(within(dialog).getByText("Sẽ lưu: 200 kcal · P 10 · C 24 · F 6 g / 100 g")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Lưu vào bữa Trưa" }));

    expect(add).toHaveBeenCalledWith({
      date: DATE,
      mealType: "lunch",
      foodName: "Bún chả Hà Nội",
      weightG: 250,
      calories: 500,
      proteinG: 25,
      carbsG: 60,
      fatG: 15,
      saveToDictionary: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "500 / 1.800 kcal (28%)");

    // Mở lại → món vừa lưu có trong từ điển, chọn 100 g = 200 kcal
    dialog = await openModal(user, "Tối");
    await user.type(within(dialog).getByRole("combobox"), "bun cha");
    const option = within(dialog).getAllByRole("option")[0];
    expect(option).toHaveTextContent("Bún chả Hà Nội");
    expect(option).toHaveTextContent("Món của tôi");
    await user.click(option);
    expect(within(dialog).getByTestId("food-calories")).toHaveTextContent("200");
  });

  it("không tìm thấy → nút 'Tự nhập & lưu vào từ điển' điền sẵn tên, tick sẵn ô lưu", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    const dialog = await openModal(user, "Phụ");

    await user.type(within(dialog).getByRole("combobox"), "  bánh   flan ");
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/trong từ điển/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Tự nhập & lưu vào từ điển" }));

    expect(within(dialog).getByRole("tab", { name: "Tự nhập" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByLabelText(/^Tên món ăn/)).toHaveValue("bánh flan");
    expect(within(dialog).getByRole("checkbox", { name: "Lưu món này vào từ điển của tôi" })).toBeChecked();
  });

  it("Tự nhập không tick: tên + calo bắt buộc, khối lượng / macro tuỳ chọn", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    const dialog = await openModal(user, "Sáng");
    await user.click(within(dialog).getByRole("tab", { name: "Tự nhập" }));

    const save = within(dialog).getByRole("button", { name: "Lưu vào bữa Sáng" });
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập tên món ăn.");
    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), "  Bánh   cuốn ");
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập số calo nguyên từ 0 đến 10000.");
    expect(add).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/^Calories/), "320");
    await user.type(within(dialog).getByLabelText("Protein (g)"), "12,5");
    await user.click(save);

    expect(add).toHaveBeenCalledWith({
      date: DATE,
      mealType: "breakfast",
      foodName: "Bánh cuốn",
      weightG: null,
      calories: 320,
      proteinG: 12.5,
      carbsG: 0,
      fatG: 0,
      saveToDictionary: false,
    });
    await waitFor(() => expect(ring("Calories")).toHaveAttribute("aria-valuetext", "320 / 1.800 kcal (18%)"));
    expect(within(meal("Sáng")).getByText("Bánh cuốn")).toBeInTheDocument();
  });

  it("mở lại modal → form trống, quay về tab Tìm món", async () => {
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    let dialog = await openModal(user, "Sáng");
    await user.click(within(dialog).getByRole("tab", { name: "Tự nhập" }));
    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), "Xôi");
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    dialog = await openModal(user, "Trưa");
    expect(within(dialog).getByRole("tab", { name: "Tìm món" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("combobox")).toHaveValue("");
  });

  it("server trả lỗi → giữ modal mở, hiện lỗi, vòng tròn không đổi", async () => {
    add.mockResolvedValue({ ok: false, error: "Bạn cần đăng nhập." });
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={[]} />);
    const dialog = await openModal(user, "Phụ");
    await user.click(within(dialog).getByRole("tab", { name: "Tự nhập" }));
    await user.type(within(dialog).getByLabelText(/^Tên món ăn/), "Sữa chua");
    await user.type(within(dialog).getByLabelText(/^Calories/), "100");
    await user.click(within(dialog).getByRole("button", { name: "Lưu vào bữa Phụ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn cần đăng nhập.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "0 / 1.800 kcal (0%)");
  });

  it("xoá món → vòng tròn giảm; server lỗi → hoàn tác", async () => {
    const initial = [entry({ id: 5, mealType: "dinner", foodName: "Cơm trắng", weightG: 200, calories: 260 })];
    del.mockResolvedValueOnce({ ok: false, error: "Không tìm thấy bản ghi." });
    const user = userEvent.setup();
    render(<NutritionTracker date={DATE} calorieGoal={GOAL} initialEntries={initial} />);

    await user.click(screen.getByRole("button", { name: "Xoá Cơm trắng khỏi bữa Tối" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy bản ghi.");
    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "260 / 1.800 kcal (14%)");

    del.mockResolvedValueOnce({ ok: true, data: { id: 5 } });
    await user.click(screen.getByRole("button", { name: "Xoá Cơm trắng khỏi bữa Tối" }));
    await waitFor(() => expect(ring("Calories")).toHaveAttribute("aria-valuetext", "0 / 1.800 kcal (0%)"));
    expect(del).toHaveBeenLastCalledWith(5);
  });

  it("chưa có hồ sơ (không có mục tiêu) → vẫn ghi được, vòng tròn hiện giá trị + link Điền hồ sơ", () => {
    render(<NutritionTracker date={DATE} calorieGoal={null} initialEntries={[]} />);
    expect(ring("Calories")).toHaveAttribute("aria-valuetext", "0 kcal, chưa có mục tiêu");
    expect(screen.getByRole("link", { name: "Điền hồ sơ" })).toHaveAttribute("href", "/profile");
    expect(within(meal("Sáng")).getByText("25% mục tiêu ngày")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm món vào bữa Sáng" })).toBeEnabled();
  });
});

