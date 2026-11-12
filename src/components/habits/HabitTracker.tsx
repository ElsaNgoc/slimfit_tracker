"use client";

import { useId, useState, useTransition } from "react";
import { createHabit, deleteHabit, setHabitCompleted } from "@/actions/habits";
import { HABIT_NAME_MAX, habitKey, normalizeHabitName, remainingSuggestions } from "@/lib/habits";
import { useDayRollover } from "@/lib/use-day-rollover";

export type HabitItem = { id: number; name: string; completed: boolean };

/**
 * To-do list thói quen của ngày `date`: checkbox (lưu ngay, optimistic), ô thêm thói quen,
 * "Gợi ý làm đẹp" để thêm nhanh, nút xoá. Trạng thái check thuộc về từng ngày (bảng habit_logs)
 * → sang ngày mới mọi thói quen tự về chưa check.
 */
export function HabitTracker({ date, initialHabits }: { date: string; initialHabits: HabitItem[] }) {
  const [habits, setHabits] = useState(initialHabits);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const [name, setName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, startAdding] = useTransition();
  const [, startTransition] = useTransition();
  const inputId = useId();
  const suggestionsId = useId();

  useDayRollover(date);

  const done = habits.filter((h) => h.completed).length;
  const suggestions = remainingSuggestions(habits.map((h) => h.name));

  function markPending(id: number, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggle(habit: HabitItem, completed: boolean) {
    setError(null);
    setHabits((list) => list.map((h) => (h.id === habit.id ? { ...h, completed } : h)));
    markPending(habit.id, true);
    startTransition(async () => {
      const res = await setHabitCompleted({ habitId: habit.id, date, completed });
      markPending(habit.id, false);
      if (!res.ok) {
        setHabits((list) => list.map((h) => (h.id === habit.id ? { ...h, completed: !completed } : h)));
        setError(res.error);
      }
    });
  }

  function add(rawName: string) {
    const clean = normalizeHabitName(rawName);
    setError(null);
    if (!clean) return setError("Nhập tên thói quen.");
    if (clean.length > HABIT_NAME_MAX) return setError(`Tối đa ${HABIT_NAME_MAX} ký tự.`);
    if (habits.some((h) => habitKey(h.name) === habitKey(clean))) {
      return setError(`Đã có thói quen "${clean}".`);
    }
    startAdding(async () => {
      const res = await createHabit({ name: clean });
      if (!res.ok) return setError(res.error);
      setHabits((list) => [...list, { id: res.data.id, name: res.data.name, completed: false }]);
      setName("");
    });
  }

  function remove(habit: HabitItem) {
    if (!window.confirm(`Xoá thói quen "${habit.name}"? Lịch sử check của thói quen này cũng bị xoá.`)) return;
    setError(null);
    const index = habits.findIndex((h) => h.id === habit.id);
    setHabits((list) => list.filter((h) => h.id !== habit.id)); // optimistic
    startTransition(async () => {
      const res = await deleteHabit(habit.id);
      if (!res.ok) {
        setHabits((list) => [...list.slice(0, index), habit, ...list.slice(index)]); // hoàn tác đúng vị trí
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {habits.length > 0 ? (
        <>
          <p className="text-sm text-zinc-400 tabular-nums" aria-live="polite">
            Đã xong <span className="font-semibold text-zinc-100">{done}</span> / {habits.length}
          </p>
          <ul className="flex flex-col gap-2">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <label
                  className={`flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors select-none ${
                    h.completed
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-zinc-800 bg-zinc-950 active:bg-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={h.completed}
                    disabled={pendingIds.has(h.id)}
                    onChange={(e) => toggle(h, e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-base font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 ${
                      h.completed ? "border-emerald-500 bg-emerald-500 text-zinc-950" : "border-zinc-600 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={`min-w-0 break-words ${h.completed ? "text-zinc-400 line-through decoration-zinc-500" : "text-zinc-100"}`}
                  >
                    {h.name}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => remove(h)}
                  aria-label={`Xoá thói quen ${h.name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-zinc-500 active:bg-zinc-800"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
          Chưa có thói quen nào. Thêm thói quen đầu tiên hoặc chọn từ gợi ý bên dưới.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
        }}
        className="flex gap-2"
      >
        <label htmlFor={inputId} className="sr-only">
          Tên thói quen mới
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          maxLength={HABIT_NAME_MAX}
          placeholder="VD: Lịch peel da HA"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isAdding}
          className="h-11 shrink-0 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {isAdding ? "…" : "Thêm thói quen"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          aria-expanded={showSuggestions}
          aria-controls={suggestionsId}
          className="flex h-11 items-center gap-2 self-start rounded-full px-3 text-sm font-medium text-emerald-400 active:bg-zinc-800"
        >
          <span aria-hidden>✨</span> Gợi ý làm đẹp
          <span aria-hidden className={`text-xs transition-transform ${showSuggestions ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
        {showSuggestions && (
          <div id={suggestionsId}>
            {suggestions.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Gợi ý làm đẹp">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={isAdding}
                      onClick={() => add(s)}
                      aria-label={`Thêm nhanh ${s}`}
                      className="flex h-11 items-center gap-1 rounded-full border border-zinc-700 px-4 text-sm text-zinc-200 active:bg-zinc-800 disabled:opacity-50"
                    >
                      <span aria-hidden className="text-emerald-400">
                        +
                      </span>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Bạn đã thêm hết các gợi ý 🎉</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
