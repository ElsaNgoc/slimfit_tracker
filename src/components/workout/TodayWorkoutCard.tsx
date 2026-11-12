"use client";

import { formatDayMonth } from "@/lib/date";
import { TEMPLATE_GUIDELINE, weekdayLabel, type WorkoutTemplate } from "@/lib/workout-templates";

/** Khối nổi bật "Gợi ý bài tập cho hôm nay (Thứ X)" ở đầu trang Workout Logger. */
export function TodayWorkoutCard({
  template,
  weekday,
  date,
  isToday,
  recommendedWeightOf,
  allAdded,
  message,
  onStart,
  onOpenWeek,
  onOpenSettings,
}: {
  template: WorkoutTemplate;
  weekday: number;
  date: string;
  isToday: boolean;
  /** Tra mức tạ gợi ý theo tên bài (undefined nếu bài chưa có trong DB). */
  recommendedWeightOf: (name: string) => string | null | undefined;
  /** Mọi bài của template đã nằm trong buổi tập. */
  allAdded: boolean;
  message: string | null;
  onStart: () => void;
  onOpenWeek: () => void;
  onOpenSettings: () => void;
}) {
  const dayText = isToday
    ? `hôm nay (${weekdayLabel(weekday)})`
    : `${weekdayLabel(weekday)}, ${formatDayMonth(date)}`;

  return (
    <section
      aria-labelledby="today-workout-title"
      className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-zinc-900 to-zinc-900 p-4 ring-1 ring-emerald-500/30"
    >
      <header className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 id="today-workout-title" className="text-sm font-medium text-emerald-300">
            Gợi ý bài tập cho {dayText}
          </h2>
          <p className="text-2xl leading-tight font-bold text-zinc-50">{template.name}</p>
          <p className="text-sm text-zinc-400">{template.focus}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenWeek}
            className="min-h-11 rounded-full border border-zinc-700 px-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            📅 Xem lịch cả tuần
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-11 rounded-full border border-zinc-700 px-3 text-sm font-medium text-zinc-300 active:bg-zinc-800"
          >
            ⚙️ Cài đặt lịch tuần
          </button>
        </div>
      </header>

      {template.kind !== "rest" && (
        <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {template.exerciseNames.map((name, i) => {
            const weight = template.kind === "gym" ? recommendedWeightOf(name) : null;
            return (
              <li key={name} className="flex items-baseline gap-2 rounded-xl bg-zinc-950/60 px-3 py-2 text-sm">
                <span className="w-4 shrink-0 text-zinc-600 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 font-medium text-zinc-200">{name}</span>
                {weight && <span className="shrink-0 text-xs text-emerald-400">{weight}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {template.kind === "gym" && (
        <>
          <button
            type="button"
            onClick={onStart}
            disabled={allAdded}
            className="h-14 rounded-xl bg-emerald-500 text-lg font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-400"
          >
            {allAdded ? "✓ Đã thêm vào buổi tập" : `Bắt đầu bài tập ${isToday ? "hôm nay" : "ngày này"}`}
          </button>
          <p className="text-xs text-zinc-500">
            {TEMPLATE_GUIDELINE.basis} · {TEMPLATE_GUIDELINE.volume} · {TEMPLATE_GUIDELINE.progression}
          </p>
        </>
      )}

      {template.kind === "yoga" && (
        <a
          href="#yoga-videos"
          className="flex h-14 items-center justify-center rounded-xl border-2 border-emerald-500 text-lg font-semibold text-emerald-300 active:bg-emerald-500/10"
        >
          Xem video giãn cơ ↓
        </a>
      )}

      {template.kind === "rest" && (
        <p className="rounded-xl bg-zinc-950/60 p-3 text-sm text-zinc-400">
          Cơ bắp phát triển trong lúc nghỉ. Nếu vẫn muốn tập, mở <strong>Xem lịch cả tuần</strong> và chọn một buổi
          bất kỳ.
        </p>
      )}

      {message && (
        <p role="status" className="text-sm text-emerald-400">
          {message}
        </p>
      )}
    </section>
  );
}
