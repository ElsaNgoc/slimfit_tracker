"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
  createWorkoutLog,
  deleteWorkoutLog,
  saveWorkoutSets,
  updateWorkoutLog,
} from "@/actions/workout-logs";
import { ExerciseInfoModal, type ExerciseDetail } from "@/components/ExerciseInfoModal";
import { TodayWorkoutCard } from "@/components/workout/TodayWorkoutCard";
import { WeeklyScheduleModal } from "@/components/workout/WeeklyScheduleModal";
import { ScheduleSettingsModal } from "@/components/workout/ScheduleSettingsModal";
import { weekdayOf } from "@/lib/date";
import { findSwapAlternatives } from "@/lib/exercise-swap";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  TEMPLATE_DEFAULT_DRAFT,
  templateForDay,
  type WeeklySchedule,
  type WorkoutTemplate,
} from "@/lib/workout-templates";

// ---------- Types ----------

export type GymExercise = ExerciseDetail;

type SetEntry = { key: string; reps: number; weight: number | null };

type Draft = { sets: string; reps: string; weight: string };

type ExerciseEntry = {
  key: string;
  exerciseId: number;
  sets: SetEntry[];
  draft: Draft;
};

type Status = { type: "idle" } | { type: "error"; message: string } | { type: "success"; message: string };

const MAX_SETS_PER_ADD = 20;
const EMPTY_DRAFT: Draft = { sets: "3", reps: "10", weight: "" };

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

/** Thẻ bài tập mới cho các bài của template (bỏ qua bài đã có), kèm thông báo cho người dùng. */
function buildTemplateEntries(
  template: WorkoutTemplate,
  exerciseByName: ReadonlyMap<string, GymExercise>,
  usedIds: ReadonlySet<number>,
): { entries: ExerciseEntry[]; message: string } {
  const found = template.exerciseNames.flatMap((n) => exerciseByName.get(n) ?? []);
  const missing = template.exerciseNames.length - found.length;
  const toAdd = found.filter((e) => !usedIds.has(e.id));

  const parts = [
    toAdd.length > 0
      ? `Đã thêm ${toAdd.length} bài từ ${template.name}.`
      : `Các bài của ${template.name} đã có trong buổi tập.`,
  ];
  if (missing > 0) parts.push(`${missing} bài chưa có trong hệ thống (cần chạy db:seed).`);

  return {
    entries: toAdd.map((e) => ({
      key: nextKey(),
      exerciseId: e.id,
      sets: [],
      draft: { ...EMPTY_DRAFT, ...TEMPLATE_DEFAULT_DRAFT },
    })),
    message: parts.join(" "),
  };
}

// ---------- Component ----------

export function WorkoutLogger({
  exercises,
  today,
  schedule = DEFAULT_WEEKLY_SCHEDULE,
  autoStart = false,
  openSettings = false,
}: {
  exercises: GymExercise[];
  /** `YYYY-MM-DD` theo giờ VN (server tính). */
  today: string;
  schedule?: WeeklySchedule;
  /** `/workouts?start=today` (nút "Bắt đầu tập" ở Tổng quan): nạp sẵn bài của buổi hôm nay. */
  autoStart?: boolean;
  /** `/workouts?schedule=edit`: mở sẵn modal Cài đặt lịch tuần. */
  openSettings?: boolean;
}) {
  const exerciseByName = useMemo(() => new Map(exercises.map((e) => [e.name, e])), [exercises]);

  // Nạp sẵn ngay ở state khởi tạo (không cần effect) để lần render đầu đã có đủ bài.
  const [initial] = useState(() => {
    const t = templateForDay(schedule, weekdayOf(today));
    return autoStart && t.kind === "gym" ? buildTemplateEntries(t, exerciseByName, new Set()) : null;
  });

  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<ExerciseEntry[]>(initial?.entries ?? []);
  const [selectedId, setSelectedId] = useState("");
  const [logId, setLogId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [templateMsg, setTemplateMsg] = useState<string | null>(initial?.message ?? null);
  const [weekOpen, setWeekOpen] = useState(false);
  // `key` đổi mỗi lần mở → bản nháp trong modal luôn bắt đầu từ lịch đã lưu
  const [settings, setSettings] = useState({ open: openSettings, key: 0 });

  // Bỏ ?start / ?schedule khỏi URL sau khi đã dùng, để tải lại trang không nạp bài lần nữa.
  useEffect(() => {
    if (autoStart || openSettings) window.history.replaceState(null, "", "/workouts");
  }, [autoStart, openSettings]);
  const [isPending, startTransition] = useTransition();
  const [info, setInfo] = useState<{ exercise: GymExercise | null; open: boolean }>({
    exercise: null,
    open: false,
  });
  const ids = useId();

  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  /** Nhóm bài tập theo nhóm cơ cho <optgroup>. */
  const grouped = useMemo(() => {
    const groups = new Map<string, GymExercise[]>();
    for (const e of exercises) {
      const g = e.muscleGroup ?? "Khác";
      groups.set(g, [...(groups.get(g) ?? []), e]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "vi"));
  }, [exercises]);

  const usedIds = new Set(entries.map((e) => e.exerciseId));
  const totalSets = entries.reduce((n, e) => n + e.sets.length, 0);

  // Gợi ý theo thứ của ngày đang chọn (mặc định hôm nay). Tính từ chuỗi ngày giờ VN thay vì
  // `new Date().getDay()` để server (UTC) và trình duyệt cho cùng kết quả.
  const weekday = weekdayOf(date);
  const suggested = templateForDay(schedule, weekday);
  const suggestedAllAdded =
    suggested.kind === "gym" &&
    suggested.exerciseNames.every((n) => {
      const e = exerciseByName.get(n);
      return !e || usedIds.has(e.id);
    });

  const touch = () => status.type !== "idle" && setStatus({ type: "idle" });

  // ----- Handlers -----

  function addExercise() {
    const id = Number(selectedId);
    if (!id || usedIds.has(id)) return;
    setEntries((prev) => [...prev, { key: nextKey(), exerciseId: id, sets: [], draft: EMPTY_DRAFT }]);
    setSelectedId("");
    touch();
  }

  /** Thêm toàn bộ bài của template (bỏ qua bài đã có trong buổi tập), giữ thứ tự của template. */
  function applyTemplate(template: WorkoutTemplate) {
    const { entries: added, message } = buildTemplateEntries(template, exerciseByName, usedIds);
    setEntries((prev) => [...prev, ...added]);
    touch();
    setTemplateMsg(message);
  }

  const openScheduleSettings = () => {
    setWeekOpen(false);
    setSettings((s) => ({ open: true, key: s.key + 1 }));
  };

  /** Đổi bài của một thẻ sang bài khác (giữ set đã nhập + số set/rep, xoá mức tạ nháp vì bài khác). */
  function swapExercise(key: string, newId: number) {
    if (usedIds.has(newId)) return;
    const from = exerciseById.get(entries.find((e) => e.key === key)?.exerciseId ?? -1);
    const to = exerciseById.get(newId);
    updateEntry(key, (e) => ({ ...e, exerciseId: newId, draft: { ...e.draft, weight: "" } }));
    if (from && to) setTemplateMsg(`Đã thay ${from.name} bằng ${to.name}.`);
  }

  function updateEntry(key: string, fn: (e: ExerciseEntry) => ExerciseEntry) {
    setEntries((prev) => prev.map((e) => (e.key === key ? fn(e) : e)));
    touch();
  }

  function removeEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    touch();
  }

  function addSets(entry: ExerciseEntry): string | null {
    const count = Number(entry.draft.sets);
    const reps = Number(entry.draft.reps);
    const weightRaw = entry.draft.weight.trim().replace(",", ".");
    const weight = weightRaw === "" ? null : Number(weightRaw);

    if (!Number.isInteger(count) || count < 1 || count > MAX_SETS_PER_ADD)
      return `Số set phải từ 1 đến ${MAX_SETS_PER_ADD}.`;
    if (!Number.isInteger(reps) || reps < 1 || reps > 1000) return "Số rep phải là số nguyên ≥ 1.";
    if (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 1000))
      return "Mức tạ không hợp lệ (0–1000 kg).";

    updateEntry(entry.key, (e) => ({
      ...e,
      // Giữ nguyên draft để nhập set tiếp theo nhanh hơn.
      sets: [...e.sets, ...Array.from({ length: count }, () => ({ key: nextKey(), reps, weight }))],
    }));
    return null;
  }

  function resetWorkout() {
    setEntries([]);
    setTemplateMsg(null);
    setNotes("");
    setLogId(null);
    setDate(today);
    setStatus({ type: "idle" });
  }

  function saveWorkout() {
    if (totalSets === 0) {
      setStatus({ type: "error", message: "Hãy thêm ít nhất 1 set trước khi lưu." });
      return;
    }

    const sets = entries.flatMap((e) =>
      e.sets.map((s, i) => ({
        exerciseId: e.exerciseId,
        setNumber: i + 1,
        reps: s.reps,
        weight: s.weight,
      })),
    );

    startTransition(async () => {
      let id = logId;
      let created = false;

      // 1. Tạo (hoặc cập nhật) bản ghi workout_logs
      if (id === null) {
        const res = await createWorkoutLog({ date, notes: notes || null });
        if (!res.ok) return setStatus({ type: "error", message: res.error });
        id = res.data.id;
        created = true;
      } else {
        const res = await updateWorkoutLog({ id, date, notes: notes || null });
        if (!res.ok) return setStatus({ type: "error", message: res.error });
      }

      // 2. Ghi toàn bộ workout_sets
      const res = await saveWorkoutSets({ workoutLogId: id, sets });
      if (!res.ok) {
        // Không để lại buổi tập rỗng nếu vừa tạo mà lưu set thất bại.
        if (created) await deleteWorkoutLog(id);
        return setStatus({ type: "error", message: res.error });
      }

      setLogId(id);
      setStatus({
        type: "success",
        message: `Đã lưu ${res.data.length} set (${entries.length} bài tập).`,
      });
    });
  }

  // ----- Render -----

  return (
    <div className="flex flex-col gap-4">
      {/* Gợi ý hôm nay */}
      {exercises.length > 0 && (
        <TodayWorkoutCard
          template={suggested}
          weekday={weekday}
          date={date}
          isToday={date === today}
          recommendedWeightOf={(name) => exerciseByName.get(name)?.recommendedWeight}
          allAdded={suggestedAllAdded}
          message={templateMsg}
          onStart={() => applyTemplate(suggested)}
          onOpenWeek={() => setWeekOpen(true)}
          onOpenSettings={openScheduleSettings}
        />
      )}

      {/* Ngày tập */}
      <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
        <label htmlFor={`${ids}-date`} className="text-sm font-medium text-zinc-400">
          Ngày tập
        </label>
        <input
          id={`${ids}-date`}
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            setDate(e.target.value);
            touch();
          }}
          className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-lg text-zinc-100 [color-scheme:dark] focus:border-emerald-500 focus:outline-none"
        />
      </section>

      {/* Chọn bài tập */}
      <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
        <label htmlFor={`${ids}-exercise`} className="text-sm font-medium text-zinc-400">
          Thêm bài tập gym
        </label>
        {exercises.length === 0 ? (
          <p className="rounded-xl bg-zinc-950 p-4 text-zinc-400">
            Chưa có bài tập gym nào trong hệ thống.
          </p>
        ) : (
          <div className="flex gap-2">
            <select
              id={`${ids}-exercise`}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-14 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-lg text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">— Chọn bài tập —</option>
              {grouped.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((e) => (
                    <option key={e.id} value={e.id} disabled={usedIds.has(e.id)}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={addExercise}
              disabled={!selectedId}
              className="h-14 shrink-0 rounded-xl bg-emerald-600 px-5 text-lg font-semibold text-white active:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              Thêm
            </button>
          </div>
        )}
      </section>

      {/* Danh sách bài tập */}
      {entries.map((entry) => (
        <ExerciseCard
          key={entry.key}
          entry={entry}
          exercise={exerciseById.get(entry.exerciseId)}
          onDraftChange={(draft) => updateEntry(entry.key, (e) => ({ ...e, draft }))}
          onAddSets={() => addSets(entry)}
          onRemoveSet={(setKey) =>
            updateEntry(entry.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.key !== setKey) }))
          }
          onRemove={() => removeEntry(entry.key)}
          onShowInfo={(exercise) => setInfo({ exercise, open: true })}
          getAlternatives={(exercise) => findSwapAlternatives(exercise, exercises, usedIds)}
          onSwap={(newId) => swapExercise(entry.key, newId)}
        />
      ))}

      {entries.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-zinc-900 p-4">
          <label htmlFor={`${ids}-notes`} className="text-sm font-medium text-zinc-400">
            Ghi chú (tuỳ chọn)
          </label>
          <textarea
            id={`${ids}-notes`}
            value={notes}
            maxLength={1000}
            rows={2}
            onChange={(e) => {
              setNotes(e.target.value);
              touch();
            }}
            placeholder="Cảm nhận, thời gian nghỉ…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
        </section>
      )}

      <WeeklyScheduleModal
        open={weekOpen}
        schedule={schedule}
        highlightDay={weekday}
        onClose={() => setWeekOpen(false)}
        onPick={(t) => {
          applyTemplate(t);
          setWeekOpen(false);
        }}
        onEdit={openScheduleSettings}
      />

      <ScheduleSettingsModal
        key={settings.key}
        open={settings.open}
        schedule={schedule}
        today={weekdayOf(today)}
        onClose={() => setSettings((s) => ({ ...s, open: false }))}
        onSaved={() => {
          setSettings((s) => ({ ...s, open: false }));
          setTemplateMsg("Đã lưu lịch tuần. Gợi ý đã cập nhật theo lịch mới.");
        }}
      />

      <ExerciseInfoModal
        exercise={info.exercise}
        open={info.open}
        onClose={() => setInfo((i) => ({ ...i, open: false }))}
      />

      {/* Thanh lưu cố định ngay trên thanh tab đáy (mobile) / đáy màn hình (desktop) — dễ bấm bằng ngón cái */}
      <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-30 border-t border-zinc-800 bg-zinc-950/95 px-4 pt-3 pb-3 backdrop-blur md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {status.type !== "idle" && (
            <p
              role={status.type === "error" ? "alert" : "status"}
              className={`text-center text-sm font-medium ${
                status.type === "error" ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {status.message}
            </p>
          )}
          <div className="flex gap-2">
            {logId !== null && (
              <button
                type="button"
                onClick={resetWorkout}
                disabled={isPending}
                className="h-14 shrink-0 rounded-xl border border-zinc-700 px-4 text-base font-medium text-zinc-300 active:bg-zinc-800"
              >
                Buổi mới
              </button>
            )}
            <button
              type="button"
              onClick={saveWorkout}
              disabled={isPending || totalSets === 0}
              className="h-14 flex-1 rounded-xl bg-emerald-500 text-lg font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isPending
                ? "Đang lưu…"
                : `${logId === null ? "Save Workout" : "Cập nhật"}${totalSets ? ` · ${totalSets} set` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- ExerciseCard ----------

function ExerciseCard({
  entry,
  exercise,
  onDraftChange,
  onAddSets,
  onRemoveSet,
  onRemove,
  onShowInfo,
  getAlternatives,
  onSwap,
}: {
  entry: ExerciseEntry;
  exercise: GymExercise | undefined;
  onDraftChange: (draft: Draft) => void;
  onAddSets: () => string | null;
  onRemoveSet: (setKey: string) => void;
  onRemove: () => void;
  onShowInfo: (exercise: GymExercise) => void;
  getAlternatives: (exercise: GymExercise) => GymExercise[];
  onSwap: (exerciseId: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const alternatives = swapOpen && exercise ? getAlternatives(exercise) : [];
  const ids = useId();
  const { draft } = entry;

  const setDraft = (patch: Partial<Draft>) => {
    setError(null);
    onDraftChange({ ...draft, ...patch });
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4">
      <header className="flex items-start justify-between gap-2">
        {exercise ? (
          <button
            type="button"
            onClick={() => onShowInfo(exercise)}
            aria-label={`Xem hướng dẫn ${exercise.name}`}
            className="-mx-2 -my-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left active:bg-zinc-800"
          >
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-zinc-100 underline decoration-zinc-600 decoration-dotted underline-offset-4">
                {exercise.name}
              </span>
              {exercise.muscleGroup && (
                <span className="block text-sm text-zinc-500">{exercise.muscleGroup}</span>
              )}
            </span>
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-500/60 text-sm font-bold text-emerald-400"
            >
              i
            </span>
          </button>
        ) : (
          <h2 className="text-lg font-semibold text-zinc-100">Bài tập</h2>
        )}
        {exercise && (
          <button
            type="button"
            onClick={() => setSwapOpen((o) => !o)}
            aria-label={`Thay thế ${exercise.name}`}
            aria-expanded={swapOpen}
            aria-controls={`${ids}-swap`}
            className={`flex h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm font-medium ${
              swapOpen
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-700 text-zinc-300 active:bg-zinc-800"
            }`}
          >
            <span aria-hidden>⇄</span>
            <span className="hidden min-[380px]:inline">Thay thế</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Xoá bài ${exercise?.name ?? ""}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-2xl text-zinc-500 active:bg-zinc-800"
        >
          ×
        </button>
      </header>

      {/* Danh sách bài thay thế cùng nhóm cơ */}
      {swapOpen && exercise && (
        <div id={`${ids}-swap`} className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2">
          <p className="px-2 pt-1 text-xs font-medium text-zinc-500">
            Bài thay thế cùng nhóm cơ ({exercise.muscleGroup?.split(",")[0] ?? "Khác"})
          </p>
          {alternatives.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-zinc-400">Chưa có bài thay thế phù hợp.</p>
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
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left active:bg-zinc-800 sm:hover:bg-zinc-900"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-zinc-100">{alt.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{alt.muscleGroup}</span>
                    </span>
                    {alt.recommendedWeight && (
                      <span className="shrink-0 text-xs text-emerald-400">{alt.recommendedWeight}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Các set đã thêm */}
      {entry.sets.length > 0 && (
        <ol className="flex flex-col gap-1">
          {entry.sets.map((s, i) => (
            <li
              key={s.key}
              className="flex h-12 items-center justify-between rounded-xl bg-zinc-950 pl-4 text-base"
            >
              <span className="text-zinc-500">Set {i + 1}</span>
              <span className="font-semibold text-zinc-100 tabular-nums">
                {s.reps} rep × {s.weight === null ? "BW" : `${s.weight} kg`}
              </span>
              <button
                type="button"
                onClick={() => onRemoveSet(s.key)}
                aria-label={`Xoá set ${i + 1}`}
                className="flex size-12 items-center justify-center text-xl text-zinc-600 active:text-red-400"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Gợi ý mức tạ + mẹo (từ lịch tập mẫu) */}
      {(exercise?.recommendedWeight || exercise?.tips) && (
        <div className="flex flex-col gap-0.5 rounded-xl bg-emerald-500/5 px-3 py-2 text-sm">
          {exercise.recommendedWeight && (
            <p className="text-emerald-400">
              <span className="font-medium">Tạ gợi ý:</span> {exercise.recommendedWeight}
            </p>
          )}
          {exercise.tips && <p className="text-zinc-400">💡 {exercise.tips}</p>}
        </div>
      )}

      {/* Form nhập nhanh */}
      <form
        noValidate // validate bằng JS để báo lỗi tiếng Việt thay vì bubble mặc định của trình duyệt
        onSubmit={(e) => {
          e.preventDefault();
          setError(onAddSets());
        }}
        className="flex flex-col gap-3"
      >
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            id={`${ids}-sets`}
            label="Số set"
            value={draft.sets}
            inputMode="numeric"
            onChange={(sets) => setDraft({ sets })}
          />
          <NumberField
            id={`${ids}-reps`}
            label="Số rep"
            value={draft.reps}
            inputMode="numeric"
            onChange={(reps) => setDraft({ reps })}
          />
          <NumberField
            id={`${ids}-weight`}
            label="Tạ (kg)"
            value={draft.weight}
            inputMode="decimal"
            placeholder="BW"
            onChange={(weight) => setDraft({ weight })}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="h-14 rounded-xl border-2 border-emerald-500 text-lg font-semibold text-emerald-400 active:bg-emerald-500/10"
        >
          + Add Set
        </button>
      </form>
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  inputMode,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  inputMode: "numeric" | "decimal";
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        pattern={inputMode === "numeric" ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-950 text-center text-2xl font-semibold text-zinc-100 tabular-nums placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
      />
    </div>
  );
}
