"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { addNutritionLog, type AddNutritionLogInput, type AddNutritionLogResult } from "@/actions/nutrition-logs";
import { formatGram, type MealType } from "@/lib/nutrition";
import { SHEET_DIALOG_CLASS, SHEET_PANEL_CLASS } from "@/components/ui/bottom-sheet";
import {
  FOOD_GRAM_MAX,
  FOOD_NAME_MAX,
  normalizeFoodName,
  per100FromPortion,
  scaleNutrients,
  searchFoods,
  type FoodItem,
  type FoodNutrients,
} from "@/lib/food-search";

type Tab = "search" | "manual";
type Meal = { type: MealType; label: string };
type Payload = Omit<AddNutritionLogInput, "date" | "mealType">;

const QUICK_GRAMS = [50, 100, 150, 200];

/** "12,5" / "12.5" → 12.5; rỗng → 0; không hợp lệ → NaN. */
function parseAmount(raw: string): number {
  const s = raw.trim().replace(",", ".");
  return s === "" ? 0 : Number(s);
}

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground placeholder:text-faint focus:border-primary focus:outline-none";
const labelClass = "text-sm font-medium text-foreground/85";

/**
 * Modal thêm món cho 1 bữa, 2 chế độ (tab):
 *   A. Tìm món — tìm trong từ điển gộp (món có sẵn + món của tôi), chọn → nhập gram → calo / macro tự nhân từ mốc 100 g.
 *   B. Tự nhập — tên + calo (bắt buộc), khối lượng / P / C / F (tuỳ chọn); tick "Lưu món này vào từ điển của tôi"
 *      để lần sau tìm được ngay.
 * <dialog> native: Esc, focus trap, chạm nền tối để đóng. Nội dung form dựng lại mỗi lần mở (key) → luôn trống.
 */
export function AddFoodModal({
  open,
  date,
  meal,
  customFoods,
  onClose,
  onAdded,
}: {
  open: boolean;
  date: string;
  meal: Meal | null;
  customFoods: FoodItem[];
  onClose: () => void;
  onAdded: (result: AddNutritionLogResult) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${useId()}-title`;
  // Mỗi lần mở = form mới, trống. Tăng NGAY khi render (không đợi effect), nếu không khung hình đầu
  // sau showModal() vẫn là form của lần trước và chữ gõ nhanh vào đó sẽ bị mất khi remount.
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSession((s) => s + 1);
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
            Thêm món · Bữa {meal?.label}
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
        {meal && (
          <AddFoodForm
            key={session}
            date={date}
            meal={meal}
            customFoods={customFoods}
            onSaved={(result) => {
              onAdded(result);
              onClose();
            }}
          />
        )}
      </div>
    </dialog>
  );
}

function AddFoodForm({
  date,
  meal,
  customFoods,
  onSaved,
}: {
  date: string;
  meal: Meal;
  customFoods: FoodItem[];
  onSaved: (result: AddNutritionLogResult) => void;
}) {
  const idPrefix = useId();
  const [tab, setTab] = useState<Tab>("search");
  /** Từ tab Tìm món bấm "Tự nhập & lưu vào từ điển" → điền sẵn tên đang gõ, tick sẵn ô lưu. */
  const [manualPrefill, setManualPrefill] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ search: null, manual: null });

  function save(payload: Payload) {
    setError(null);
    startTransition(async () => {
      const res = await addNutritionLog({ date, mealType: meal.type, ...payload });
      if (!res.ok) return setError(res.error);
      onSaved(res.data);
    });
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
  }

  const tabs: [Tab, string][] = [
    ["search", "Tìm món"],
    ["manual", "Tự nhập"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Cách thêm món" className="grid grid-cols-2 gap-1 rounded-xl bg-background p-1">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            ref={(el) => {
              tabRefs.current[value] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${idPrefix}-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => switchTab(value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const next = value === "search" ? "manual" : "search";
              switchTab(next);
              tabRefs.current[next]?.focus();
            }}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
              tab === value ? "bg-muted text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${idPrefix}-panel-${tab}`} aria-labelledby={`${idPrefix}-tab-${tab}`}>
        {tab === "search" ? (
          <SearchPanel
            meal={meal}
            customFoods={customFoods}
            isPending={isPending}
            error={error}
            setError={setError}
            onSave={save}
            onManual={(name) => {
              setManualPrefill(name);
              switchTab("manual");
            }}
          />
        ) : (
          <ManualPanel meal={meal} prefillName={manualPrefill} isPending={isPending} error={error} setError={setError} onSave={save} />
        )}
      </div>
    </div>
  );
}

// ---------- Chế độ A: Tìm món ----------

function SearchPanel({
  meal,
  customFoods,
  isPending,
  error,
  setError,
  onSave,
  onManual,
}: {
  meal: Meal;
  customFoods: FoodItem[];
  isPending: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSave: (p: Payload) => void;
  onManual: (name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const gramsRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchFoods(query, customFoods), [query, customFoods]);
  const showList = listOpen && !selected && query.trim() !== "";
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => {
    if (selected) gramsRef.current?.select();
  }, [selected]);

  function choose(item: FoodItem) {
    setSelected(item);
    setQuery(item.name);
    setListOpen(false);
    setGrams("100");
    setError(null);
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setError(null);
    queryRef.current?.focus();
  }

  const gramValue = parseAmount(grams);
  const gramValid = Number.isFinite(gramValue) && gramValue > 0 && gramValue <= FOOD_GRAM_MAX;
  const computed = selected && gramValid ? scaleNutrients(selected.per100, 100, gramValue) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return setError("Tìm và chọn một món trong danh sách gợi ý.");
    if (!gramValid || !computed) return setError(`Nhập số gram từ 1 đến ${FOOD_GRAM_MAX.toLocaleString("vi-VN")}.`);
    onSave({ foodName: selected.name, weightG: Math.round(gramValue * 10) / 10, ...computed });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-q`} className={labelClass}>
          Tìm món ăn
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
            🔍
          </span>
          <input
            ref={queryRef}
            id={`${id}-q`}
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
            autoComplete="off"
            autoFocus
            enterKeyHint="search"
            placeholder="VD: thịt bò, cơm, rau muống…"
            value={query}
            readOnly={Boolean(selected)}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
              setActive(0);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (results.length === 0) return;
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((a) => (a + step + results.length) % results.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (results[active]) choose(results[active]);
              } else if (e.key === "Escape") {
                e.preventDefault(); // chỉ đóng danh sách, không đóng modal
                setListOpen(false);
              }
            }}
            className={`${inputClass} pl-10 ${selected ? "text-muted-foreground" : ""}`}
          />
        </div>

        {showList && (
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            {results.length === 0 ? (
              <div className="flex flex-col gap-2 px-3 py-3 text-sm text-muted-foreground">
                <p>Chưa có “{query.trim()}” trong từ điển.</p>
                <button
                  type="button"
                  onClick={() => onManual(normalizeFoodName(query))}
                  className="h-11 rounded-lg bg-muted font-semibold text-foreground active:bg-muted/70"
                >
                  Tự nhập & lưu vào từ điển
                </button>
              </div>
            ) : (
              <ul id={listId} role="listbox" aria-label="Gợi ý món ăn" className="max-h-72 overflow-y-auto">
                {results.map((item, i) => (
                  <li
                    key={item.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()} // giữ focus ở ô tìm
                    onClick={() => choose(item)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 ${
                      i === active ? "bg-muted" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        P {formatGram(item.per100.proteinG)} · C {formatGram(item.per100.carbsG)} · F{" "}
                        {formatGram(item.per100.fatG)} g
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {item.per100.calories.toLocaleString("vi-VN")}
                        <span className="text-xs font-normal text-muted-foreground"> kcal/100g</span>
                      </span>
                      <SourceTag item={item} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!selected && !showList && (
          <p className="text-xs text-muted-foreground">
            Từ điển gồm món Việt thông dụng
            {customFoods.length > 0 ? ` + ${customFoods.length} món của bạn` : ""}. Số liệu tính trên 100 g.
          </p>
        )}
      </div>

      {selected && (
        <div className="flex flex-col gap-3 rounded-xl bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{selected.name}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                {selected.per100.calories.toLocaleString("vi-VN")} kcal / 100 g <SourceTag item={selected} />
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-link active:bg-muted"
            >
              Đổi món
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-g`} className={labelClass}>
              Số lượng (gram)
            </label>
            <div className="relative">
              <input
                ref={gramsRef}
                id={`${id}-g`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={grams}
                onChange={(e) => {
                  setGrams(e.target.value.replace(/[^\d.,]/g, ""));
                  setError(null);
                }}
                className="h-14 w-full rounded-xl border border-border bg-card pr-10 pl-4 text-2xl font-bold tabular-nums focus:border-primary focus:outline-none"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">g</span>
            </div>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Chọn nhanh số gram">
              {QUICK_GRAMS.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gramValue === g}
                  onClick={() => {
                    setGrams(String(g));
                    setError(null);
                  }}
                  className={`h-11 rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                    gramValue === g ? "bg-primary/15 text-link ring-1 ring-primary/40" : "bg-card text-muted-foreground"
                  }`}
                >
                  {g} g
                </button>
              ))}
            </div>
          </div>

          <NutrientGrid values={computed} />
        </div>
      )}

      <FormError error={error} />
      <SaveButton meal={meal} isPending={isPending} disabled={!selected} />
    </form>
  );
}

function SourceTag({ item }: { item: FoodItem }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium ${
        item.source === "custom" ? "bg-primary/15 text-link" : "bg-muted text-muted-foreground"
      }`}
    >
      {item.tag}
    </span>
  );
}

function NutrientGrid({ values }: { values: FoodNutrients | null }) {
  const cells = [
    ["Calories", "kcal", values?.calories, "calories"],
    ["Protein", "g", values?.proteinG, "protein"],
    ["Carbs", "g", values?.carbsG, "carbs"],
    ["Fat", "g", values?.fatG, "fat"],
  ] as const;
  return (
    <dl className="grid grid-cols-4 gap-2 text-center" aria-live="polite">
      {cells.map(([label, unit, value, key]) => (
        <div key={key} className="rounded-lg bg-card px-1 py-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-bold text-foreground tabular-nums">
            <span data-testid={`food-${key}`}>
              {value === undefined ? "–" : key === "calories" ? value.toLocaleString("vi-VN") : formatGram(value)}
            </span>
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Chế độ B: Tự nhập & nhớ món ----------

type ManualValues = { name: string; calories: string; weightG: string; proteinG: string; carbsG: string; fatG: string };
const EMPTY_MANUAL: ManualValues = { name: "", calories: "", weightG: "", proteinG: "", carbsG: "", fatG: "" };
const MACRO_FIELDS = [
  ["proteinG", "Protein (g)"],
  ["carbsG", "Carbs (g)"],
  ["fatG", "Fat (g)"],
] as const;

function ManualPanel({
  meal,
  prefillName,
  isPending,
  error,
  setError,
  onSave,
}: {
  meal: Meal;
  prefillName: string | null;
  isPending: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSave: (p: Payload) => void;
}) {
  const id = useId();
  const [v, setV] = useState<ManualValues>(prefillName ? { ...EMPTY_MANUAL, name: prefillName } : EMPTY_MANUAL);
  const [remember, setRemember] = useState(prefillName !== null);
  const set = (k: keyof ManualValues, value: string) => {
    setV((old) => ({ ...old, [k]: value }));
    setError(null);
  };

  const kcal = v.calories.trim() === "" ? NaN : parseAmount(v.calories);
  const weight = v.weightG.trim() === "" ? null : parseAmount(v.weightG);
  const macros = { proteinG: parseAmount(v.proteinG), carbsG: parseAmount(v.carbsG), fatG: parseAmount(v.fatG) };
  const kcalValid = Number.isInteger(kcal) && kcal >= 0 && kcal <= 10000;
  const weightValid = weight === null || (Number.isFinite(weight) && weight > 0 && weight <= FOOD_GRAM_MAX);
  const macrosValid = Object.values(macros).every((n) => Number.isFinite(n) && n >= 0 && n <= 2000);
  const preview =
    remember && kcalValid && macrosValid && weight !== null && weightValid
      ? per100FromPortion({ calories: kcal, ...macros }, weight)
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = normalizeFoodName(v.name);
    if (!name) return setError("Nhập tên món ăn.");
    if (name.length > FOOD_NAME_MAX) return setError(`Tên món tối đa ${FOOD_NAME_MAX} ký tự.`);
    if (!kcalValid) return setError("Nhập số calo nguyên từ 0 đến 10000.");
    if (!weightValid) return setError(`Khối lượng phải từ 1 đến ${FOOD_GRAM_MAX.toLocaleString("vi-VN")} g.`);
    if (!macrosValid) return setError("Protein / Carbs / Fat phải từ 0 đến 2000 g.");
    if (remember && weight === null) return setError("Nhập khối lượng (gram) để lưu vào từ điển.");
    onSave({ foodName: name, weightG: weight, calories: kcal, ...macros, saveToDictionary: remember });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className={labelClass}>
          Tên món ăn <span className="text-destructive">*</span>
        </label>
        <input
          id={`${id}-name`}
          type="text"
          autoComplete="off"
          autoFocus
          maxLength={FOOD_NAME_MAX}
          placeholder="VD: Bún chả Hà Nội"
          value={v.name}
          onChange={(e) => set("name", e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-kcal`} className={labelClass}>
            Calories <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              id={`${id}-kcal`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={v.calories}
              onChange={(e) => set("calories", e.target.value.replace(/\D/g, ""))}
              className={`${inputClass} pr-12 text-lg font-semibold tabular-nums`}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">kcal</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-w`} className={labelClass}>
            Khối lượng {remember && <span className="text-destructive">*</span>}
          </label>
          <div className="relative">
            <input
              id={`${id}-w`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="—"
              value={v.weightG}
              onChange={(e) => set("weightG", e.target.value.replace(/[^\d.,]/g, ""))}
              className={`${inputClass} pr-8 text-lg font-semibold tabular-nums`}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">g</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MACRO_FIELDS.map(([k, label]) => (
          <div key={k} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${k}`} className={labelClass}>
              {label}
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

      <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
        <label htmlFor={`${id}-remember`} className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            id={`${id}-remember`}
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              setError(null);
            }}
            className="size-5 shrink-0 accent-primary"
          />
          <span className="text-sm font-medium text-foreground">Lưu món này vào từ điển của tôi</span>
        </label>
        {remember && (
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {preview
              ? `Sẽ lưu: ${preview.calories.toLocaleString("vi-VN")} kcal · P ${formatGram(preview.proteinG)} · C ${formatGram(
                  preview.carbsG,
                )} · F ${formatGram(preview.fatG)} g / 100 g`
              : "Nhập khối lượng phần ăn để quy đổi số liệu về 100 g."}
          </p>
        )}
      </div>

      <FormError error={error} />
      <SaveButton meal={meal} isPending={isPending} />
    </form>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

function SaveButton({ meal, isPending, disabled = false }: { meal: Meal; isPending: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={isPending || disabled}
      className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground transition-colors active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
    >
      {isPending ? "Đang lưu…" : `Lưu vào bữa ${meal.label}`}
    </button>
  );
}
