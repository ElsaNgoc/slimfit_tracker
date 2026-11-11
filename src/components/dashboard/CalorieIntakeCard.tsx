"use client";

import { useId, useState, useTransition } from "react";
import { upsertDailyLog } from "@/actions/daily-logs";

/** Nhập tổng calo nạp vào hôm nay (1 con số) → lưu `total_calories` trong daily_logs. */
export function CalorieIntakeCard({
  date,
  initialCalories,
  calorieGoal,
}: {
  date: string;
  initialCalories: number;
  calorieGoal: number | null;
}) {
  const [saved, setSaved] = useState(initialCalories);
  const [value, setValue] = useState(initialCalories ? String(initialCalories) : "");
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const id = useId();

  const remaining = calorieGoal !== null ? calorieGoal - saved : null;
  const percent = calorieGoal ? Math.min(100, Math.round((saved / calorieGoal) * 100)) : 0;
  const dirty = value.trim() !== (saved ? String(saved) : "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const calories = value.trim() === "" ? 0 : Number(value);
    if (!Number.isInteger(calories) || calories < 0 || calories > 20000) {
      setStatus({ type: "error", message: "Nhập số nguyên từ 0 đến 20000." });
      return;
    }
    startTransition(async () => {
      const res = await upsertDailyLog({ date, totalCalories: calories });
      if (!res.ok) return setStatus({ type: "error", message: res.error });
      setSaved(res.data.totalCalories);
      setValue(res.data.totalCalories ? String(res.data.totalCalories) : "");
      setStatus({ type: "success", message: "Đã lưu." });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-base font-semibold text-zinc-100">
          Tổng lượng Calo nạp vào hôm nay
        </label>
      </div>

      <form noValidate onSubmit={submit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="0"
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/\D/g, ""));
              setStatus(null);
            }}
            onFocus={(e) => e.target.select()}
            className="h-16 w-full rounded-xl border border-zinc-700 bg-zinc-950 pr-16 pl-4 text-3xl font-bold text-zinc-100 tabular-nums placeholder:text-zinc-700 focus:border-emerald-500 focus:outline-none"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-base text-zinc-500">
            kcal
          </span>
        </div>
        <button
          type="submit"
          disabled={isPending || !dirty}
          className="h-16 shrink-0 rounded-xl bg-emerald-500 px-6 text-lg font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {isPending ? "…" : "Lưu"}
        </button>
      </form>

      {status && (
        <p
          role={status.type === "error" ? "alert" : "status"}
          className={`text-sm ${status.type === "error" ? "text-red-400" : "text-emerald-400"}`}
        >
          {status.message}
        </p>
      )}

      {calorieGoal !== null && remaining !== null && (
        <div className="flex flex-col gap-2">
          <div
            className="h-3 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={calorieGoal}
            aria-valuenow={saved}
            aria-label="Calo đã nạp so với mục tiêu"
          >
            <div
              className={`h-full rounded-full ${remaining < 0 ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-zinc-400 tabular-nums">
            {remaining >= 0 ? (
              <>
                Còn <span className="font-semibold text-emerald-400">{remaining.toLocaleString("vi-VN")}</span>{" "}
                kcal so với mục tiêu
              </>
            ) : (
              <>
                Vượt mục tiêu{" "}
                <span className="font-semibold text-red-400">{(-remaining).toLocaleString("vi-VN")}</span> kcal
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
