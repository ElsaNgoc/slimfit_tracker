"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateWeeklySchedule } from "@/actions/schedule";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  WEEK_ORDER,
  WORKOUT_TEMPLATES,
  sameSchedule,
  summarizeSchedule,
  templateForDay,
  weekdayLabel,
  type TemplateKind,
  type WeeklySchedule,
} from "@/lib/workout-templates";

export const KIND_LABEL: Record<TemplateKind, string> = { gym: "Gym", yoga: "Yoga", rest: "Nghỉ" };
const KIND_DOT: Record<TemplateKind, string> = { gym: "bg-emerald-500", yoga: "bg-sky-400", rest: "bg-zinc-600" };
const GROUPS: TemplateKind[] = ["gym", "yoga", "rest"];

/**
 * Modal "Cài đặt lịch tuần": chọn buổi tập cho từng ngày Thứ 2 → Chủ nhật, lưu vào `users.weekly_schedule`.
 * Bản nháp khởi tạo từ `schedule` khi mount — parent đổi `key` mỗi lần mở để luôn bắt đầu từ lịch đã lưu.
 */
export function ScheduleSettingsModal({
  open,
  schedule,
  today,
  onClose,
  onSaved,
}: {
  open: boolean;
  schedule: WeeklySchedule;
  /** Thứ của hôm nay (0 = CN) — đánh dấu "Hôm nay". */
  today: number;
  onClose: () => void;
  onSaved: (schedule: WeeklySchedule) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<WeeklySchedule>(() => [...schedule]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = useId();

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

  const dirty = !sameSchedule(draft, schedule);
  const isDefault = sameSchedule(draft, DEFAULT_WEEKLY_SCHEDULE);
  const summary = summarizeSchedule(draft);

  function setDay(day: number, templateId: string) {
    setDraft((d) => d.map((id, i) => (i === day ? templateId : id)));
    setError(null);
  }

  function save() {
    startTransition(async () => {
      const res = await updateWeeklySchedule(draft);
      if (!res.ok) return setError(res.error);
      onSaved(res.data);
    });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-title`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="group mx-auto mt-auto mb-0 h-auto max-h-[92dvh] w-full max-w-full overflow-visible bg-transparent p-0 text-zinc-100 opacity-0 transition-all transition-discrete duration-300 ease-out backdrop:bg-black/70 backdrop:opacity-0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-300 open:opacity-100 open:backdrop:opacity-100 sm:my-auto sm:max-w-lg starting:open:opacity-0 starting:open:backdrop:opacity-0"
    >
      <div className="flex max-h-[92dvh] translate-y-full flex-col overflow-hidden rounded-t-3xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 transition-transform duration-300 ease-out group-open:translate-y-0 sm:translate-y-8 sm:rounded-3xl sm:group-open:translate-y-0 starting:group-open:translate-y-full sm:starting:group-open:translate-y-8">
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div>
            <h2 id={`${ids}-title`} className="text-xl font-bold">
              Cài đặt lịch tuần
            </h2>
            <p className="text-sm text-zinc-400">Chọn buổi tập cho từng ngày — gợi ý hôm nay sẽ đi theo lịch này.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-2xl text-zinc-300 active:bg-zinc-700"
          >
            ×
          </button>
        </div>

        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-2">
          {WEEK_ORDER.map((day) => {
            const t = templateForDay(draft, day);
            const changed = draft[day] !== schedule[day];
            const selectId = `${ids}-day-${day}`;
            return (
              <li
                key={day}
                className={`flex flex-col gap-1.5 rounded-2xl p-3 ${
                  day === today ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : "bg-zinc-950/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${KIND_DOT[t.kind]}`} />
                  <label htmlFor={selectId} className="text-sm font-semibold text-zinc-200">
                    {weekdayLabel(day)}
                  </label>
                  {day === today && <span className="text-xs font-semibold text-emerald-400">Hôm nay</span>}
                  {changed && <span className="ml-auto text-xs text-amber-300">Đã đổi</span>}
                </div>
                <select
                  id={selectId}
                  value={draft[day]}
                  onChange={(e) => setDay(day, e.target.value)}
                  className="h-12 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-base text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  {GROUPS.map((kind) => (
                    <optgroup key={kind} label={KIND_LABEL[kind]}>
                      {WORKOUT_TEMPLATES.filter((x) => x.kind === kind).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  {KIND_LABEL[t.kind]} · {t.focus}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-zinc-400" aria-live="polite">
            {summary.gym} buổi gym · {summary.yoga} yoga · {summary.rest} nghỉ
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft([...DEFAULT_WEEKLY_SCHEDULE]);
                setError(null);
              }}
              disabled={isDefault || isPending}
              className="h-12 shrink-0 rounded-xl border border-zinc-700 px-3 text-sm font-medium text-zinc-300 active:bg-zinc-800 disabled:opacity-40"
            >
              Lịch mặc định
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || isPending}
              className="h-12 flex-1 rounded-xl bg-emerald-500 text-base font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isPending ? "Đang lưu…" : dirty ? "Lưu lịch tuần" : "Chưa có thay đổi"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
