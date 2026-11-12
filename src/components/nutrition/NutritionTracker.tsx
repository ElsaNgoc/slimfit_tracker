"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deleteNutritionLog } from "@/actions/nutrition-logs";
import type { NutritionLog } from "@/db/schema";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import {
  MEALS,
  formatGram,
  macroGoals,
  mealCalorieTargets,
  sumNutrition,
  type MealType,
} from "@/lib/nutrition";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { customFoodItem, foodNameKey, type CustomFoodRow } from "@/lib/food-search";
import { MacroRings, type NutritionGoals } from "./MacroRings";
import { AddFoodModal } from "./AddFoodModal";

export type NutritionEntry = Pick<
  NutritionLog,
  "id" | "mealType" | "foodName" | "weightG" | "calories" | "proteinG" | "carbsG" | "fatG" | "fiberG"
>;

/** Bản ghi cũ (trước khi có cột food_name) có tên rỗng. */
const displayName = (e: NutritionEntry) => e.foodName || "Món chưa đặt tên";

/**
 * Tracking dinh dưỡng trong ngày: vòng tròn macro (trên cùng) + 4 thẻ bữa ăn.
 * State bản ghi giữ ở client → thêm / xoá món cập nhật vòng tròn ngay (số "nhảy" tới giá trị mới).
 */
export function NutritionTracker({
  date,
  calorieGoal,
  initialEntries,
  initialCustomFoods = [],
}: {
  date: string;
  calorieGoal: number | null;
  initialEntries: NutritionEntry[];
  /** Từ điển món riêng của user (custom_foods) — gộp với từ điển tĩnh khi tìm món. */
  initialCustomFoods?: CustomFoodRow[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [customFoods, setCustomFoods] = useState(initialCustomFoods);
  const customFoodItems = useMemo(() => customFoods.map(customFoodItem), [customFoods]);
  const [modal, setModal] = useState<{ open: boolean; meal: (typeof MEALS)[number] | null }>({
    open: false,
    meal: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const goals: NutritionGoals | null =
    calorieGoal !== null ? { calories: calorieGoal, ...macroGoals(calorieGoal) } : null;
  const targets = calorieGoal !== null ? mealCalorieTargets(calorieGoal) : null;

  function remove(entry: NutritionEntry) {
    setError(null);
    setEntries((list) => list.filter((e) => e.id !== entry.id)); // optimistic
    startTransition(async () => {
      const res = await deleteNutritionLog(entry.id);
      if (!res.ok) {
        setEntries((list) => [...list, entry]); // hoàn tác
        setError(res.error);
      }
    });
  }

  return (
    <>
      <DashboardWidget id="daily-nutrition" icon="🎯" title="Dinh dưỡng hôm nay" emptyText="" className="md:col-span-2">
        <MacroRings totals={sumNutrition(entries)} goals={goals} />
        {goals === null && (
          <p className="text-sm text-zinc-400">
            <Link href="/profile" className="font-medium text-emerald-400 underline-offset-2 hover:underline">
              Điền hồ sơ
            </Link>{" "}
            để có mục tiêu calo và macro mỗi ngày.
          </p>
        )}
      </DashboardWidget>

      <DashboardWidget id="meals" icon="🍽️" title="Bữa ăn hôm nay" emptyText="" className="md:col-span-2">
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MEALS.map((meal) => (
            <MealCard
              key={meal.type}
              meal={meal}
              target={targets?.[meal.type] ?? null}
              entries={entries.filter((e) => e.mealType === meal.type)}
              onAdd={() => setModal({ open: true, meal })}
              onRemove={remove}
            />
          ))}
        </div>
      </DashboardWidget>

      <AddFoodModal
        open={modal.open}
        date={date}
        meal={modal.meal}
        customFoods={customFoodItems}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onAdded={({ log, customFood }) => {
          setEntries((list) => [...list, log]);
          // Món vừa lưu vào từ điển → tìm được ngay ở lần thêm sau (trùng tên = bản cập nhật, đưa lên đầu)
          if (customFood) {
            setCustomFoods((list) => [
              customFood,
              ...list.filter((f) => f.id !== customFood.id && foodNameKey(f.name) !== foodNameKey(customFood.name)),
            ]);
          }
        }}
      />
    </>
  );
}

function MealCard({
  meal,
  target,
  entries,
  onAdd,
  onRemove,
}: {
  meal: { type: MealType; label: string; share: number };
  target: number | null;
  entries: NutritionEntry[];
  onAdd: () => void;
  onRemove: (entry: NutritionEntry) => void;
}) {
  const consumed = entries.reduce((s, e) => s + e.calories, 0);
  const shown = useAnimatedNumber(consumed);
  const fill = target ? Math.min(100, (consumed / target) * 100) : 0;

  return (
    <section
      aria-labelledby={`meal-${meal.type}`}
      data-meal={meal.type}
      className="flex flex-col gap-3 rounded-xl bg-zinc-950 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`meal-${meal.type}`} className="font-semibold text-zinc-100">
            {meal.label}
          </h3>
          <p className="text-xs text-zinc-500 tabular-nums">
            {target !== null
              ? `Gợi ý ${target.toLocaleString("vi-VN")} kcal · ${Math.round(meal.share * 100)}%`
              : `${Math.round(meal.share * 100)}% mục tiêu ngày`}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Thêm món vào bữa ${meal.label}`}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-4 text-sm font-bold text-zinc-950 active:bg-emerald-600"
        >
          <span aria-hidden className="text-lg leading-none">
            +
          </span>
          Thêm món
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-zinc-300 tabular-nums">
          <span className="text-xl font-bold text-zinc-100" data-testid={`meal-kcal-${meal.type}`}>
            {Math.round(shown).toLocaleString("vi-VN")}
          </span>
          {target !== null ? ` / ${target.toLocaleString("vi-VN")}` : ""} kcal
        </p>
        {target !== null && (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[#3987e5]/20"
            role="progressbar"
            aria-label={`Calo bữa ${meal.label}`}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={consumed}
          >
            <div
              className="h-full rounded-full bg-[#3987e5] transition-[width] duration-700 ease-out"
              style={{ width: `${fill}%` }}
            />
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-zinc-800 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-100">{displayName(e)}</p>
                <p className="text-xs text-zinc-500 tabular-nums">
                  {e.weightG !== null && `${formatGram(e.weightG)} g · `}P {formatGram(e.proteinG)} · C{" "}
                  {formatGram(e.carbsG)} · F {formatGram(e.fatG)}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-zinc-100 tabular-nums">
                {e.calories.toLocaleString("vi-VN")} kcal
              </span>
              <button
                type="button"
                onClick={() => onRemove(e)}
                aria-label={`Xoá ${displayName(e)} khỏi bữa ${meal.label}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-zinc-500 active:bg-zinc-800"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
