"use client";

import type { ExerciseDetail } from "@/components/ExerciseInfoModal";
import { parseDuration, type Entry } from "@/components/workout/workout-entry";
import { FINISHER_INFO, finisherLabel } from "@/lib/workout-templates";

/**
 * Khu vực ĐỐT MỠ CUỐI BUỔI: chuỗi liên hoàn — mỗi bài 1 dòng checkbox "đã xong" + mục tiêu mỗi vòng,
 * thời gian (giây) tuỳ chọn. Không nhập tạ. Tick / nhập thời gian tự lưu.
 */
export function FinisherSection({
  entries,
  exerciseById,
  onToggle,
  onDurationChange,
  onDurationCommit,
  onRemove,
  onShowInfo,
}: {
  entries: Entry[];
  exerciseById: ReadonlyMap<number, ExerciseDetail>;
  onToggle: (entry: Entry) => void;
  onDurationChange: (entry: Entry, duration: string) => void;
  onDurationCommit: (entry: Entry) => void;
  onRemove: (entry: Entry) => void;
  onShowInfo: (exercise: ExerciseDetail) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Chưa có bài đốt mỡ. Bấm “Bắt đầu bài tập” ở trên, hoặc chọn bài trong nhóm 🔥 Đốt mỡ cuối buổi.
      </p>
    );
  }

  const done = entries.filter((e) => e.sets[0]?.completed).length;

  return (
    <section aria-labelledby="phase-finisher" data-phase="finisher" className="flex flex-col gap-2 rounded-2xl bg-card p-4">
      <p className="text-sm font-medium text-foreground tabular-nums" data-testid="finisher-progress">
        Đã xong {done} / {entries.length} bài
        {done === entries.length && <span className="text-link"> · Hoàn thành chuỗi đốt mỡ 🔥</span>}
      </p>
      <ol className="flex flex-col gap-2">
        {entries.map((entry, i) => {
          const exercise = exerciseById.get(entry.exerciseId);
          const name = exercise?.name ?? "Bài tập";
          const label = finisherLabel(name);
          const target = FINISHER_INFO[name]?.target;
          const row = entry.sets[0];
          const durationError = row ? parseDuration(row.duration) : null;
          const checkboxId = `finisher-${entry.key}`;
          return (
            <li
              key={entry.key}
              data-testid="finisher-row"
              data-done={row?.completed ?? false}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                row?.completed ? "bg-primary/15" : "bg-background/60"
              }`}
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={row?.completed ?? false}
                onChange={() => onToggle(entry)}
                className="size-7 shrink-0 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <label htmlFor={checkboxId} className="block cursor-pointer">
                  <span className={`font-semibold ${row?.completed ? "text-foreground/85 line-through decoration-2" : "text-foreground"}`}>
                    {i + 1}. {label}
                  </span>
                  {label !== name && <span className="text-xs text-muted-foreground"> ({name})</span>}
                </label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {target && <span>Mỗi vòng: {target}</span>}
                  {exercise && (
                    <button
                      type="button"
                      onClick={() => onShowInfo(exercise)}
                      aria-label={`Xem hướng dẫn ${name}`}
                      className="min-h-8 font-medium text-link underline-offset-2 hover:underline"
                    >
                      Cách tập
                    </button>
                  )}
                </div>
                {typeof durationError === "string" && (
                  <p role="alert" className="text-xs text-destructive">
                    {durationError}
                  </p>
                )}
              </div>
              <label className="flex shrink-0 flex-col items-center text-[11px] text-muted-foreground">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`Thời gian (giây) — ${label}`}
                  placeholder="—"
                  value={row?.duration ?? ""}
                  onChange={(e) => onDurationChange(entry, e.target.value.replace(/\D/g, ""))}
                  onBlur={() => onDurationCommit(entry)}
                  className="h-10 w-14 rounded-lg border border-border bg-background text-center text-base font-semibold text-foreground tabular-nums placeholder:text-faint focus:border-primary focus:outline-none"
                />
                giây
              </label>
              <button
                type="button"
                onClick={() => onRemove(entry)}
                aria-label={`Bỏ bài ${label}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-faint active:bg-muted"
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
