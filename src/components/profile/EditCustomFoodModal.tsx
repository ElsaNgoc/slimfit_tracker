"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateCustomFood } from "@/actions/custom-foods";
import { SHEET_DIALOG_CLASS, SHEET_PANEL_CLASS } from "@/components/ui/bottom-sheet";
import { caloriesFromMacros } from "@/lib/nutrition";
import {
  FOOD_NAME_MAX,
  MAX_KCAL_PER_100G,
  MAX_MACRO_PER_100G,
  normalizeFoodName,
  per100Problem,
  type CustomFoodRow,
} from "@/lib/food-search";

/** "12,5" / "12.5" → 12.5; rỗng → 0; không hợp lệ → NaN. */
function parseAmount(raw: string): number {
  const s = raw.trim().replace(",", ".");
  return s === "" ? 0 : Number(s);
}

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-faint focus:border-primary focus:outline-none";
const labelClass = "text-sm font-medium text-foreground/85";

/**
 * Modal sửa 1 món trong từ điển riêng (tên + Calo / Protein / Carbs / Fat trên 100 g), điền sẵn dữ liệu cũ.
 * `food` null = đóng. Form dựng lại mỗi lần mở (key = id + lượt mở) nên luôn bắt đầu từ dữ liệu hiện tại, không giữ bản nháp.
 */
export function EditCustomFoodModal({
  food,
  onClose,
  onSaved,
}: {
  food: CustomFoodRow | null;
  onClose: () => void;
  onSaved: (food: CustomFoodRow) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${useId()}-title`;
  const open = food !== null;
  // Giữ món cuối cùng để form vẫn hiển thị trong lúc dialog trượt xuống (food đã về null khi đóng)
  const [shown, setShown] = useState(food);
  // Mỗi lần mở = 1 lượt mới → form remount với dữ liệu gốc. Tăng NGAY khi render (không đợi effect),
  // nếu không khung hình đầu sau showModal() vẫn là form cũ và chữ gõ nhanh vào đó sẽ bị mất khi remount.
  const [session, setSession] = useState(0);
  const [prevFood, setPrevFood] = useState(food);
  if (food !== prevFood) {
    setPrevFood(food);
    if (food) {
      setShown(food);
      setSession((s) => s + 1);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Sự kiện "close" bắn bất đồng bộ: nếu dialog đã được mở lại (bấm mở ngay sau khi đóng) thì đó là sự kiện cũ → bỏ qua
      onClose={(e) => !e.currentTarget.open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={SHEET_DIALOG_CLASS}
    >
      <div className={SHEET_PANEL_CLASS}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">
            Sửa món
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-2xl text-foreground/85 active:bg-muted/70"
          >
            ×
          </button>
        </div>
        {shown && <EditForm key={`${shown.id}-${session}`} food={shown} onSaved={onSaved} />}
      </div>
    </dialog>
  );
}

type Values = { name: string; calories: string; proteinG: string; carbsG: string; fatG: string };

const NUMBER_FIELDS = [
  ["proteinG", "Protein"],
  ["carbsG", "Carbs"],
  ["fatG", "Fat"],
] as const;

const show = (n: number) => String(n).replace(".", ",");

function EditForm({ food, onSaved }: { food: CustomFoodRow; onSaved: (food: CustomFoodRow) => void }) {
  const id = useId();
  const [v, setV] = useState<Values>({
    name: food.name,
    calories: String(food.calories),
    proteinG: show(food.proteinG),
    carbsG: show(food.carbsG),
    fatG: show(food.fatG),
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = (k: keyof Values, value: string) => {
    setV((old) => ({ ...old, [k]: value }));
    setError(null);
  };

  const macros = { proteinG: parseAmount(v.proteinG), carbsG: parseAmount(v.carbsG), fatG: parseAmount(v.fatG) };
  const macrosValid = Object.values(macros).every((n) => Number.isFinite(n) && n >= 0 && n <= MAX_MACRO_PER_100G);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeFoodName(v.name);
    if (!name) return setError("Nhập tên món ăn.");
    const kcal = v.calories.trim() === "" ? NaN : parseAmount(v.calories);
    if (!Number.isInteger(kcal) || kcal < 0 || kcal > MAX_KCAL_PER_100G) {
      return setError(`Nhập số calo nguyên từ 0 đến ${MAX_KCAL_PER_100G} (trên 100 g).`);
    }
    if (!macrosValid) return setError(`Protein / Carbs / Fat phải từ 0 đến ${MAX_MACRO_PER_100G} g.`);
    const problem = per100Problem({ calories: kcal, ...macros });
    if (problem) return setError(problem);

    startTransition(async () => {
      const res = await updateCustomFood({ id: food.id, name, calories: kcal, ...macros });
      if (!res.ok) return setError(res.error);
      onSaved(res.data);
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Mọi chỉ số tính trên 100 g.</p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className={labelClass}>
          Tên món ăn <span className="text-destructive">*</span>
        </label>
        <input
          id={`${id}-name`}
          type="text"
          autoComplete="off"
          maxLength={FOOD_NAME_MAX}
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-kcal`} className={labelClass}>
          Calories / 100 g <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <input
            id={`${id}-kcal`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={v.calories}
            onChange={(e) => set("calories", e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} pr-14 text-lg font-semibold tabular-nums`}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">kcal</span>
        </div>
        {macrosValid && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Theo macro ≈ {caloriesFromMacros(macros).toLocaleString("vi-VN")} kcal
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {NUMBER_FIELDS.map(([k, label]) => (
          <div key={k} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${k}`} className={labelClass}>
              {label} (g)
            </label>
            <input
              id={`${id}-${k}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={v[k]}
              onChange={(e) => set(k, e.target.value.replace(/[^\d.,]/g, ""))}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground transition-colors active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </form>
  );
}
