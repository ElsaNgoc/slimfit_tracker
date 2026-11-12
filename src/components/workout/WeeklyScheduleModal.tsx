"use client";

import { useEffect, useRef } from "react";
import { WEEK_ORDER, templateForDay, weekdayLabel, type WeeklySchedule, type WorkoutTemplate, finisherLabel } from "@/lib/workout-templates";

const KIND_STYLE: Record<WorkoutTemplate["kind"], { dot: string; badge: string }> = {
  gym: { dot: "bg-primary", badge: "Gym" },
  yoga: { dot: "bg-accent", badge: "Yoga" },
  rest: { dot: "bg-faint", badge: "Nghỉ" },
};

/**
 * Modal timeline Thứ 2 → Chủ nhật. <dialog> native: Esc / chạm nền tối / nút Đóng để đóng.
 * Mobile: bottom sheet; sm+: hộp thoại giữa màn hình (cùng phong cách ExerciseInfoModal).
 */
export function WeeklyScheduleModal({
  open,
  schedule,
  highlightDay,
  onClose,
  onPick,
  onEdit,
}: {
  open: boolean;
  schedule: WeeklySchedule;
  /** Thứ đang chọn ở form (được đánh dấu "Đang xem"). */
  highlightDay: number;
  onClose: () => void;
  /** Bấm "Tập buổi này" ở một ngày gym. */
  onPick: (template: WorkoutTemplate) => void;
  /** Mở Cài đặt lịch tuần (không truyền → ẩn nút). */
  onEdit?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      aria-labelledby="weekly-schedule-title"
      // Sự kiện "close" bắn bất đồng bộ: nếu dialog đã được mở lại (bấm mở ngay sau khi đóng) thì đó là sự kiện cũ → bỏ qua
      onClose={(e) => !e.currentTarget.open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="group mx-auto mt-auto mb-0 h-auto max-h-[92dvh] w-full max-w-full overflow-visible bg-transparent p-0 text-foreground opacity-0 transition-all transition-discrete duration-300 ease-out backdrop:bg-black/70 backdrop:opacity-0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-300 open:opacity-100 open:backdrop:opacity-100 sm:my-auto sm:max-w-lg starting:open:opacity-0 starting:open:backdrop:opacity-0"
    >
      <div className="flex max-h-[92dvh] translate-y-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl ring-1 ring-foreground/10 transition-transform duration-300 ease-out group-open:translate-y-0 sm:translate-y-8 sm:rounded-3xl sm:group-open:translate-y-0 starting:group-open:translate-y-full sm:starting:group-open:translate-y-8">
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-3">
          <h2 id="weekly-schedule-title" className="text-xl font-bold">
            Lịch tập cả tuần
          </h2>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="ml-auto min-h-11 rounded-full border border-border px-3 text-sm font-medium text-foreground/85 active:bg-muted"
            >
              ⚙️ Chỉnh lịch
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-2xl text-foreground/85 active:bg-muted/70"
          >
            ×
          </button>
        </div>

        <ol className="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {WEEK_ORDER.map((day, i) => {
            const t = templateForDay(schedule, day);
            const style = KIND_STYLE[t.kind];
            const current = day === highlightDay;
            return (
              <li key={day} aria-current={current ? "date" : undefined} className="flex gap-3">
                {/* Trục timeline */}
                <div className="flex w-3 flex-col items-center" aria-hidden>
                  <span className={`mt-5 size-3 shrink-0 rounded-full ${style.dot} ${current ? "ring-4 ring-primary/30" : ""}`} />
                  {i < WEEK_ORDER.length - 1 && <span className="w-px flex-1 bg-muted" />}
                </div>
                <div
                  className={`my-1.5 flex min-w-0 flex-1 flex-col gap-2 rounded-2xl p-3 ${
                    current ? "bg-primary/10 ring-1 ring-primary/40" : "bg-background/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-muted-foreground">{weekdayLabel(day)}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{style.badge}</span>
                    {current && <span className="text-xs font-semibold text-link">Đang xem</span>}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.focus}</p>
                    {t.exerciseNames.length > 0 && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.exerciseNames.join(" · ")}</p>
                    )}
                    {t.finisherNames.length > 0 && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        + Đốt mỡ: {t.finisherNames.map(finisherLabel).join(" · ")}
                      </p>
                    )}
                  </div>
                  {t.kind === "gym" && (
                    <button
                      type="button"
                      onClick={() => onPick(t)}
                      aria-label={`Tập buổi ${t.name} (${weekdayLabel(day)})`}
                      className="min-h-11 self-start rounded-xl border border-primary/50 px-4 text-sm font-semibold text-link active:bg-primary/10"
                    >
                      + Tập buổi này
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </dialog>
  );
}
