import Link from "next/link";
import { weekdayOf } from "@/lib/date";
import { templateForDay, weekdayLabel, type WeeklySchedule } from "@/lib/workout-templates";

const KIND_BADGE = {
  gym: { label: "Gym", className: "bg-emerald-500/15 text-emerald-300" },
  yoga: { label: "Yoga", className: "bg-sky-400/15 text-sky-300" },
  rest: { label: "Nghỉ", className: "bg-zinc-800 text-zinc-400" },
} as const;

/** Số bài hiển thị trước khi gộp thành "+N bài nữa" (giữ widget gọn trên mobile). */
const PREVIEW_COUNT = 4;

/**
 * Widget "Gợi ý bài tập hôm nay" trên Tổng quan: đọc thứ của hôm nay theo giờ VN và đối chiếu
 * lịch tuần của user (`users.weekly_schedule`). Server Component — không cần JS phía client.
 *
 * Thứ tính bằng `weekdayOf(today)` (today = `todayInAppTz()`), KHÔNG dùng `new Date().getDay()`:
 * server chạy UTC nên từ 0h–7h sáng giờ VN, `getDay()` trên server vẫn trả về hôm qua.
 */
export function TodayWorkoutWidget({ today, schedule }: { today: string; schedule: WeeklySchedule }) {
  const weekday = weekdayOf(today);
  const template = templateForDay(schedule, weekday);
  const tomorrow = templateForDay(schedule, (weekday + 1) % 7);
  const badge = KIND_BADGE[template.kind];
  const preview = template.exerciseNames.slice(0, PREVIEW_COUNT);
  const more = template.exerciseNames.length - preview.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">{weekdayLabel(weekday)}</p>
          <p className="text-xl leading-tight font-bold text-zinc-50" data-testid="today-template">
            {template.name}
          </p>
          <p className="text-sm text-zinc-400">{template.focus}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
      </div>

      {preview.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm">
          {preview.map((name, i) => (
            <li key={name} className="flex gap-2 rounded-lg bg-zinc-950/60 px-3 py-1.5">
              <span className="w-4 shrink-0 text-zinc-600 tabular-nums">{i + 1}</span>
              <span className="min-w-0 text-zinc-200">{name}</span>
            </li>
          ))}
          {more > 0 && <li className="px-3 text-xs text-zinc-500">+{more} bài nữa</li>}
        </ol>
      )}

      {template.kind === "gym" && (
        <Link
          href="/workouts?start=today"
          className="flex h-12 items-center justify-center rounded-xl bg-emerald-500 text-base font-bold text-zinc-950 active:bg-emerald-600"
        >
          Bắt đầu tập
        </Link>
      )}
      {template.kind === "yoga" && (
        <Link
          href="/workouts#yoga-videos"
          className="flex h-12 items-center justify-center rounded-xl border-2 border-emerald-500 text-base font-semibold text-emerald-300 active:bg-emerald-500/10"
        >
          Xem video giãn cơ
        </Link>
      )}
      {template.kind === "rest" && (
        <p className="rounded-xl bg-zinc-950/60 p-3 text-sm text-zinc-400">
          Hôm nay là ngày nghỉ — cơ bắp phát triển trong lúc nghỉ ngơi. 😴
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-2 text-sm">
        <p className="min-w-0 text-zinc-500">
          Ngày mai: <span className="text-zinc-300">{tomorrow.name}</span>
        </p>
        <Link
          href="/workouts?schedule=edit"
          className="flex min-h-11 shrink-0 items-center rounded-full px-3 font-medium text-emerald-400 active:bg-zinc-800"
        >
          ⚙️ Đổi lịch
        </Link>
      </div>
    </div>
  );
}
