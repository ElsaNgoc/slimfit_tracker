"use client";

import { useState, useTransition } from "react";
import { upsertDailyLog } from "@/actions/daily-logs";

/** Habit tracker: tick là lưu ngay `yoga_completed` vào daily_logs (optimistic, hoàn tác nếu lỗi). */
export function YogaHabitCard({ date, initialCompleted }: { date: string; initialCompleted: boolean }) {
  const [checked, setChecked] = useState(initialCompleted);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const res = await upsertDailyLog({ date, yogaCompleted: next });
      if (!res.ok) {
        setChecked(!next);
        setError(res.error);
      } else {
        setChecked(res.data.yogaCompleted);
      }
    });
  }

  return (
    <section>
      <label
        className={`flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border-2 p-5 transition-colors select-none ${
          checked
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-zinc-800 bg-zinc-900 active:bg-zinc-800"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl border-2 text-3xl font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 ${
            checked ? "border-emerald-500 bg-emerald-500 text-zinc-950" : "border-zinc-600 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className="flex flex-col">
          <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Thói quen hôm nay</span>
          <span className={`text-lg leading-snug font-semibold ${checked ? "text-emerald-300" : "text-zinc-100"}`}>
            Đã tập Yoga giãn cơ 30 phút tối nay
          </span>
          <span className="text-sm text-zinc-500" aria-live="polite">
            {isPending ? "Đang lưu…" : checked ? "Tuyệt vời! Đã ghi nhận 🎉" : "Chạm để đánh dấu hoàn thành"}
          </span>
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
