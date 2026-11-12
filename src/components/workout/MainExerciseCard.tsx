"use client";

import { useId, useState } from "react";
import type { ExerciseDetail } from "@/components/ExerciseInfoModal";
import { parseMainSet, type Entry, type SetRow } from "@/components/workout/workout-entry";

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border bg-background text-center text-xl font-semibold text-foreground tabular-nums placeholder:text-faint focus:outline-none";

/**
 * Thẻ 1 bài thuộc BÀI TẬP CHÍNH: danh sách hiệp sửa trực tiếp (rep × kg) + "+ Thêm hiệp".
 * Mọi thay đổi tự lưu — thẻ chỉ báo lên WorkoutLogger, không tự gọi server.
 */
export function MainExerciseCard({
  entry,
  exercise,
  onAddSet,
  onEditSet,
  onCommitSet,
  onDeleteSet,
  onRemove,
  onShowInfo,
  getAlternatives,
  onSwap,
}: {
  entry: Entry;
  exercise: ExerciseDetail | undefined;
  onAddSet: () => void;
  onEditSet: (rowKey: string, patch: Pick<Partial<SetRow>, "reps" | "weight">) => void;
  onCommitSet: (rowKey: string) => void;
  onDeleteSet: (row: SetRow) => void;
  onRemove: () => void;
  onShowInfo: (exercise: ExerciseDetail) => void;
  getAlternatives: (exercise: ExerciseDetail) => ExerciseDetail[];
  onSwap: (exerciseId: number) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const alternatives = swapOpen && exercise ? getAlternatives(exercise) : [];
  const ids = useId();
  const name = exercise?.name ?? "Bài tập";

  return (
    <section aria-label={name} data-phase="main" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        {exercise ? (
          <button
            type="button"
            onClick={() => onShowInfo(exercise)}
            aria-label={`Xem hướng dẫn ${exercise.name}`}
            className="-mx-2 -my-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left active:bg-muted"
          >
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-foreground underline decoration-faint decoration-dotted underline-offset-4">
                {exercise.name}
              </span>
              {exercise.muscleGroup && <span className="block text-sm text-muted-foreground">{exercise.muscleGroup}</span>}
            </span>
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/60 text-sm font-bold text-link"
            >
              i
            </span>
          </button>
        ) : (
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        )}
        {exercise && (
          <button
            type="button"
            onClick={() => setSwapOpen((o) => !o)}
            aria-label={`Thay thế ${exercise.name}`}
            aria-expanded={swapOpen}
            aria-controls={`${ids}-swap`}
            className={`flex h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium ${
              swapOpen ? "border-primary bg-primary/15 text-link" : "border-border text-foreground/85 active:bg-muted"
            }`}
          >
            <span aria-hidden>⇄</span>
            <span className="hidden min-[380px]:inline">Thay thế</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Xoá bài ${name}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-muted-foreground active:bg-muted"
        >
          ×
        </button>
      </header>

      {swapOpen && exercise && (
        <div id={`${ids}-swap`} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-2">
          <p className="px-2 pt-1 text-xs font-medium text-muted-foreground">
            Bài thay thế cùng nhóm cơ ({exercise.muscleGroup?.split(",")[0] ?? "Khác"})
          </p>
          {alternatives.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-muted-foreground">Chưa có bài thay thế phù hợp.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {alternatives.map((alt) => (
                <li key={alt.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSwap(alt.id);
                      setSwapOpen(false);
                    }}
                    aria-label={`Đổi sang ${alt.name}`}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left active:bg-muted sm:hover:bg-card"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{alt.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{alt.muscleGroup}</span>
                    </span>
                    {alt.recommendedWeight && <span className="shrink-0 text-xs text-link">{alt.recommendedWeight}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(exercise?.recommendedWeight || exercise?.tips) && (
        <div className="flex flex-col gap-0.5 rounded-xl bg-primary/5 px-3 py-2 text-sm">
          {exercise.recommendedWeight && (
            <p className="text-link">
              <span className="font-medium">Tạ gợi ý:</span> {exercise.recommendedWeight}
            </p>
          )}
          {exercise.tips && <p className="text-muted-foreground">💡 {exercise.tips}</p>}
        </div>
      )}

      {entry.sets.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label={`Các hiệp ${name}`}>
          {entry.sets.map((row, i) => {
            const n = i + 1;
            const problem = parseMainSet(row);
            const error = typeof problem === "string" ? problem : null;
            return (
              <li key={row.key} className="flex flex-col gap-1" data-testid="set-row" data-saved={row.id !== null}>
                <div className="flex items-center gap-2 rounded-xl bg-background/60 py-1 pr-1 pl-3">
                  <span className="w-12 shrink-0 text-sm text-muted-foreground">Hiệp {n}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`Số rep hiệp ${n}`}
                    value={row.reps}
                    onChange={(e) => onEditSet(row.key, { reps: e.target.value.replace(/\D/g, "") })}
                    onBlur={() => onCommitSet(row.key)}
                    onFocus={(e) => e.target.select()}
                    className={`${inputClass} ${error?.startsWith("Số rep") ? "border-destructive" : "border-border focus:border-primary"}`}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">rep ×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Tạ (kg) hiệp ${n}`}
                    placeholder="BW"
                    value={row.weight}
                    onChange={(e) => onEditSet(row.key, { weight: e.target.value.replace(/[^\d.,]/g, "") })}
                    onBlur={() => onCommitSet(row.key)}
                    onFocus={(e) => e.target.select()}
                    className={`${inputClass} ${error?.startsWith("Mức tạ") ? "border-destructive" : "border-border focus:border-primary"}`}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">kg</span>
                  <button
                    type="button"
                    onClick={() => onDeleteSet(row)}
                    aria-label={`Xoá hiệp ${n}`}
                    className="flex size-11 shrink-0 items-center justify-center text-xl text-faint active:text-destructive"
                  >
                    ×
                  </button>
                </div>
                {error && (
                  <p role="alert" className="px-3 text-xs text-destructive">
                    Hiệp {n}: {error} (chưa lưu)
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        onClick={onAddSet}
        className="h-12 rounded-xl border-2 border-primary text-base font-semibold text-link transition-colors active:bg-primary/10"
      >
        + Thêm hiệp
      </button>
    </section>
  );
}
