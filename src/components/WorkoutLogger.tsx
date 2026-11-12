"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addWorkoutSet,
  changeWorkoutExercise,
  deleteWorkoutSet,
  removeWorkoutExercise,
  saveWorkoutNotes,
  updateWorkoutSet,
} from "@/actions/workout-logs";
import { ExerciseInfoModal, type ExerciseDetail } from "@/components/ExerciseInfoModal";
import { TodayWorkoutCard } from "@/components/workout/TodayWorkoutCard";
import { WeeklyScheduleModal } from "@/components/workout/WeeklyScheduleModal";
import { ScheduleSettingsModal } from "@/components/workout/ScheduleSettingsModal";
import { MainExerciseCard } from "@/components/workout/MainExerciseCard";
import { FinisherSection } from "@/components/workout/FinisherSection";
import { useAutosave, type AutosaveStatus } from "@/components/workout/use-autosave";
import type { ActionResult } from "@/lib/action-result";
import type { LoggedSet } from "@/db/queries/workouts";
import { parseDuration, parseMainSet, type Entry, type SetRow } from "@/components/workout/workout-entry";
import { weekdayOf } from "@/lib/date";
import { findSwapAlternatives } from "@/lib/exercise-swap";
import {
  DEFAULT_FIRST_SET,
  DEFAULT_WEEKLY_SCHEDULE,
  PHASE_GUIDE,
  finisherLabel,
  templateForDay,
  type WeeklySchedule,
  type WorkoutPhase,
  type WorkoutTemplate,
} from "@/lib/workout-templates";

// ---------- Types ----------

export type GymExercise = ExerciseDetail;

const COMMIT_DELAY_MS = 700;

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

const emptyFinisherRow = (): SetRow => ({ key: nextKey(), id: null, reps: "", weight: "", duration: "", completed: false });

/** Dựng lại các thẻ bài tập từ set đã lưu (giữ thứ tự tập; mỗi bài + giai đoạn = 1 thẻ). */
function entriesFromLog(sets: readonly LoggedSet[]): Entry[] {
  const byKey = new Map<string, Entry>();
  for (const s of sets) {
    const k = `${s.phase}:${s.exerciseId}`;
    if (!byKey.has(k)) byKey.set(k, { key: nextKey(), exerciseId: s.exerciseId, phase: s.phase, sets: [] });
    byKey.get(k)!.sets.push({
      key: nextKey(),
      id: s.id,
      reps: s.reps === null ? "" : String(s.reps),
      weight: s.weight === null ? "" : String(s.weight).replace(".", ","),
      duration: s.durationSec === null ? "" : String(s.durationSec),
      completed: s.completed,
    });
  }
  return [...byKey.values()].map((e) => (e.phase === "finisher" ? { ...e, sets: e.sets.slice(0, 1) } : e));
}

/** Thẻ mới cho bài của template (chính + đốt mỡ), bỏ qua bài đã có, kèm thông báo. */
function templateEntries(
  template: WorkoutTemplate,
  exerciseByName: ReadonlyMap<string, GymExercise>,
  usedIds: ReadonlySet<number>,
): { entries: Entry[]; message: string } {
  const plan: [string, WorkoutPhase][] = [
    ...template.exerciseNames.map((n): [string, WorkoutPhase] => [n, "main"]),
    ...template.finisherNames.map((n): [string, WorkoutPhase] => [n, "finisher"]),
  ];
  const found = plan.flatMap(([n, phase]) => {
    const e = exerciseByName.get(n);
    return e ? [{ e, phase }] : [];
  });
  const toAdd = found.filter(({ e }) => !usedIds.has(e.id));
  const missing = plan.length - found.length;
  const parts = [
    toAdd.length > 0 ? `Đã thêm ${toAdd.length} bài từ ${template.name}.` : `Các bài của ${template.name} đã có trong buổi tập.`,
  ];
  if (missing > 0) parts.push(`${missing} bài chưa có trong hệ thống (cần chạy db:seed).`);
  return {
    entries: toAdd.map(({ e, phase }) => ({
      key: nextKey(),
      exerciseId: e.id,
      phase,
      sets: phase === "finisher" ? [emptyFinisherRow()] : [],
    })),
    message: parts.join(" "),
  };
}

// ---------- Component ----------

/**
 * Màn hình ghi chép tập luyện — TỰ ĐỘNG LƯU, không có nút Save.
 *   BÀI TẬP CHÍNH: mỗi bài là 1 thẻ; "+ Thêm hiệp" ghi ngay 1 hiệp vào DB (chép rep / kg của hiệp trước),
 *     sửa rep / kg lưu sau 0,7 giây ngừng gõ hoặc khi rời ô, xoá hiệp xoá ngay.
 *   ĐỐT MỠ CUỐI BUỔI: chuỗi liên hoàn — tick hoàn thành (tuỳ chọn ghi thời gian), không nhập tạ.
 * Giao diện cập nhật ngay (optimistic), lệnh lưu chạy tuần tự trong nền (useAutosave); lỗi → hoàn tác + báo.
 * Buổi tập của ngày đọc lại từ DB khi tải trang (initialLog) → tải lại trang không mất gì.
 */
export function WorkoutLogger({
  exercises,
  today,
  date = today,
  schedule = DEFAULT_WEEKLY_SCHEDULE,
  initialLog = null,
  autoStart = false,
  openSettings = false,
}: {
  exercises: GymExercise[];
  /** `YYYY-MM-DD` theo giờ VN (server tính). */
  today: string;
  /** Ngày đang ghi (`/workouts?date=`), mặc định hôm nay. */
  date?: string;
  schedule?: WeeklySchedule;
  /** Buổi tập đã lưu của ngày `date` (null = chưa tập). */
  initialLog?: { logId: number; notes: string | null; sets: LoggedSet[] } | null;
  /** `/workouts?start=today` (nút "Bắt đầu tập" ở Tổng quan): nạp sẵn bài của buổi hôm nay. */
  autoStart?: boolean;
  /** `/workouts?schedule=edit`: mở sẵn modal Cài đặt lịch tuần. */
  openSettings?: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const exerciseByName = useMemo(() => new Map(exercises.map((e) => [e.name, e])), [exercises]);
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const weekday = weekdayOf(date);
  const suggested = templateForDay(schedule, weekday);

  // State khởi tạo: buổi đã lưu, hoặc (từ "Bắt đầu tập", chưa có gì) nạp sẵn bài của template hôm nay.
  const [initial] = useState(() => {
    const saved = entriesFromLog(initialLog?.sets ?? []);
    if (saved.length === 0 && autoStart && date === today && suggested.kind === "gym") {
      return templateEntries(suggested, exerciseByName, new Set());
    }
    return { entries: saved, message: null };
  });
  const [entries, setEntries] = useState<Entry[]>(initial.entries);
  const [notes, setNotes] = useState(initialLog?.notes ?? "");
  const [selectedId, setSelectedId] = useState("");
  const [templateMsg, setTemplateMsg] = useState<string | null>(initial.message);
  const [weekOpen, setWeekOpen] = useState(false);
  const [settings, setSettings] = useState({ open: openSettings, key: 0 });
  const [info, setInfo] = useState<{ exercise: GymExercise | null; open: boolean }>({ exercise: null, open: false });

  const { save, status } = useAutosave();
  const logId = useRef<number | null>(initialLog?.logId ?? null);
  const savedNotes = useRef(initialLog?.notes ?? "");
  /** key hiệp → id trong DB. Lệnh trong hàng đợi đọc id lúc CHẠY (hiệp vừa thêm có thể chưa có id lúc bấm). */
  const idByKey = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    for (const e of initial.entries) for (const s of e.sets) if (s.id !== null) idByKey.current.set(s.key, s.id);
  }, [initial]);

  // Bỏ ?start / ?schedule khỏi URL sau khi đã dùng, để tải lại trang không nạp bài lần nữa.
  useEffect(() => {
    if (autoStart || openSettings) window.history.replaceState(null, "", date === today ? "/workouts" : `/workouts?date=${date}`);
  }, [autoStart, openSettings, date, today]);

  const usedIds = new Set(entries.map((e) => e.exerciseId));
  const mainEntries = entries.filter((e) => e.phase === "main");
  const finisherEntries = entries.filter((e) => e.phase === "finisher");
  const suggestedAllAdded =
    suggested.kind === "gym" &&
    [...suggested.exerciseNames, ...suggested.finisherNames].every((n) => {
      const e = exerciseByName.get(n);
      return !e || usedIds.has(e.id);
    });

  // ----- Cập nhật state -----

  const patchEntry = (key: string, fn: (e: Entry) => Entry) => setEntries((list) => list.map((e) => (e.key === key ? fn(e) : e)));
  const patchRow = (entryKey: string, rowKey: string, patch: Partial<SetRow>) =>
    patchEntry(entryKey, (e) => ({ ...e, sets: e.sets.map((s) => (s.key === rowKey ? { ...s, ...patch } : s)) }));
  const findRow = (entryKey: string, rowKey: string) =>
    entriesRef.current.find((e) => e.key === entryKey)?.sets.find((s) => s.key === rowKey);
  const rememberSaved = (rowKey: string, entryKey: string, savedId: number, newLogId: number) => {
    idByKey.current.set(rowKey, savedId);
    logId.current = newLogId;
    patchRow(entryKey, rowKey, { id: savedId });
  };

  // ----- Thêm bài -----

  function addExercise() {
    const exercise = exerciseById.get(Number(selectedId));
    if (!exercise || usedIds.has(exercise.id)) return;
    const phase = exercise.phase ?? "main";
    setEntries((list) => [
      ...list,
      { key: nextKey(), exerciseId: exercise.id, phase, sets: phase === "finisher" ? [emptyFinisherRow()] : [] },
    ]);
    setSelectedId("");
  }

  function applyTemplate(template: WorkoutTemplate) {
    const { entries: added, message } = templateEntries(template, exerciseByName, usedIds);
    setEntries((list) => [...list, ...added]);
    setTemplateMsg(message);
  }

  // ----- Bài Tập Chính: hiệp -----

  /** "+ Thêm hiệp": chép rep / kg của hiệp trước (hoặc mặc định), lưu ngay. */
  function addSet(entry: Entry) {
    const last = entry.sets.at(-1);
    const fromLast = last ? parseMainSet(last) : null;
    const values = fromLast && typeof fromLast !== "string" ? fromLast : { reps: DEFAULT_FIRST_SET.reps, weight: null };
    const row: SetRow = {
      key: nextKey(),
      id: null,
      reps: String(values.reps),
      weight: values.weight === null ? "" : String(values.weight).replace(".", ","),
      duration: "",
      completed: false,
    };
    patchEntry(entry.key, (e) => ({ ...e, sets: [...e.sets, row] }));
    void save(async () => {
      const res = await addWorkoutSet({ phase: "main", date, exerciseId: entry.exerciseId, ...values });
      // Ghi nhớ id NGAY TRONG lệnh: lệnh kế tiếp trong hàng đợi (vd. sửa kg hiệp này) chạy ngay sau đó và cần id
      if (res.ok) rememberSaved(row.key, entry.key, res.data.set.id, res.data.logId);
      return res;
    }).then((res) => {
      if (!res.ok) patchEntry(entry.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.key !== row.key) }));
    });
  }

  /** Gõ rep / kg: cập nhật ngay trên màn hình, lưu sau khi ngừng gõ. */
  function editSet(entryKey: string, rowKey: string, patch: Pick<Partial<SetRow>, "reps" | "weight">) {
    patchRow(entryKey, rowKey, patch);
    clearTimeout(timers.current.get(rowKey));
    timers.current.set(rowKey, setTimeout(() => commitSet(entryKey, rowKey), COMMIT_DELAY_MS));
  }

  function commitSet(entryKey: string, rowKey: string) {
    clearTimeout(timers.current.get(rowKey));
    timers.current.delete(rowKey);
    const row = findRow(entryKey, rowKey);
    if (!row) return;
    const values = parseMainSet(row);
    if (typeof values === "string") return; // ô đang sai → hiện lỗi tại chỗ, không lưu
    void save<unknown>(async () => {
      const id = idByKey.current.get(rowKey);
      return id ? updateWorkoutSet({ id, ...values }) : { ok: true as const, data: null };
    });
  }

  function deleteSet(entry: Entry, row: SetRow) {
    clearTimeout(timers.current.get(row.key));
    timers.current.delete(row.key);
    const index = entry.sets.findIndex((s) => s.key === row.key);
    patchEntry(entry.key, (e) => ({ ...e, sets: e.sets.filter((s) => s.key !== row.key) }));
    void save<unknown>(async () => {
      const id = idByKey.current.get(row.key);
      return id ? deleteWorkoutSet(id) : { ok: true as const, data: null };
    }).then((res) => {
      if (res.ok) return idByKey.current.delete(row.key);
      // Hoàn tác đúng vị trí cũ
      patchEntry(entry.key, (e) => ({ ...e, sets: [...e.sets.slice(0, index), row, ...e.sets.slice(index)] }));
    });
  }

  // ----- Đốt mỡ: tick hoàn thành / thời gian (thêm nếu chưa có dòng, sửa nếu đã có) -----

  function saveFinisher(entry: Entry, row: SetRow, patch: { completed?: boolean; durationSec?: number | null }, undo: Partial<SetRow>) {
    void save<unknown>(async () => {
      const id = idByKey.current.get(row.key);
      if (id) return updateWorkoutSet({ id, ...patch });
      const res = await addWorkoutSet({
        phase: "finisher",
        date,
        exerciseId: entry.exerciseId,
        completed: patch.completed ?? true,
        durationSec: patch.durationSec ?? null,
      });
      if (res.ok) rememberSaved(row.key, entry.key, res.data.set.id, res.data.logId);
      return res;
    }).then((res) => {
      if (!res.ok) patchRow(entry.key, row.key, undo);
    });
  }

  function toggleFinisher(entry: Entry) {
    const row = entry.sets[0];
    const completed = !row.completed;
    patchRow(entry.key, row.key, { completed });
    saveFinisher(entry, row, { completed }, { completed: row.completed });
  }

  function commitDuration(entry: Entry) {
    const row = findRow(entry.key, entry.sets[0].key);
    if (!row) return;
    const durationSec = parseDuration(row.duration);
    if (typeof durationSec === "string") return;
    // Ghi thời gian = đã làm bài này → tự tick hoàn thành
    const completed = durationSec !== null ? true : row.completed;
    if (completed !== row.completed) patchRow(entry.key, row.key, { completed });
    saveFinisher(entry, row, { durationSec, completed }, { completed: row.completed });
  }

  // ----- Bỏ / đổi bài -----

  /**
   * Số dòng của thẻ đã (hoặc đang) được ghi vào DB. Hiệp chính luôn được ghi ngay khi thêm; dòng đốt mỡ chỉ
   * được ghi khi đã tick / nhập thời gian.
   */
  const touchedRows = (entry: Entry) =>
    entry.phase === "main" ? entry.sets.length : entry.sets.filter((s) => s.id !== null || s.completed || s.duration).length;

  /**
   * Lệnh cần buổi tập đã tồn tại (bỏ / đổi bài): xếp hàng và đọc logId LÚC CHẠY — nếu hiệp vừa thêm còn đang lưu
   * thì lệnh này chạy sau nó nên vẫn bắt được, không để lại dữ liệu mồ côi.
   */
  const saveForLog = <T,>(task: (currentLog: number) => Promise<ActionResult<T>>) =>
    save<T | null>(async () => (logId.current === null ? { ok: true as const, data: null } : task(logId.current)));

  function removeEntry(entry: Entry) {
    const touched = touchedRows(entry);
    const name = exerciseById.get(entry.exerciseId)?.name ?? "";
    if (touched > 0 && !window.confirm(`Bỏ bài ${name}? ${touched} dòng đã ghi sẽ bị xoá.`)) return;
    const index = entries.findIndex((e) => e.key === entry.key);
    entry.sets.forEach((s) => clearTimeout(timers.current.get(s.key)));
    setEntries((list) => list.filter((e) => e.key !== entry.key));
    if (touched === 0) return;
    void saveForLog((currentLog) => removeWorkoutExercise({ logId: currentLog, exerciseId: entry.exerciseId })).then((res) => {
      if (res.ok) entry.sets.forEach((s) => idByKey.current.delete(s.key));
      else setEntries((list) => [...list.slice(0, index), entry, ...list.slice(index)]);
    });
  }

  function swapExercise(entry: Entry, toId: number) {
    if (usedIds.has(toId)) return;
    const from = exerciseById.get(entry.exerciseId);
    const to = exerciseById.get(toId);
    patchEntry(entry.key, (e) => ({ ...e, exerciseId: toId }));
    if (from && to) setTemplateMsg(`Đã thay ${from.name} bằng ${to.name}.`);
    if (touchedRows(entry) === 0) return;
    void saveForLog((currentLog) =>
      changeWorkoutExercise({ logId: currentLog, fromExerciseId: entry.exerciseId, toExerciseId: toId }),
    ).then((res) => {
      if (!res.ok) patchEntry(entry.key, (e) => ({ ...e, exerciseId: entry.exerciseId }));
    });
  }

  function commitNotes() {
    if (notes.trim() === savedNotes.current.trim()) return;
    const value = notes;
    void save(async () => {
      const res = await saveWorkoutNotes({ date, notes: value });
      if (res.ok) {
        savedNotes.current = value;
        logId.current = res.data.logId;
      }
      return res;
    });
  }

  /** Ô đang chờ lưu (trong 0,7 giây sau khi gõ) → lưu ngay. Dùng khi đổi ngày / rời trang. */
  function flushPending() {
    for (const rowKey of [...timers.current.keys()]) {
      const entry = entriesRef.current.find((e) => e.sets.some((s) => s.key === rowKey));
      if (entry) commitSet(entry.key, rowKey);
    }
  }
  const flushRef = useRef(flushPending);
  useEffect(() => {
    flushRef.current = flushPending;
  });
  useEffect(() => () => flushRef.current(), []); // rời trang (unmount): không bỏ dở thay đổi đang chờ

  const openScheduleSettings = () => {
    setWeekOpen(false);
    setSettings((s) => ({ open: true, key: s.key + 1 }));
  };

  // ----- Render -----

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, GymExercise[]>();
    for (const e of exercises) {
      const g = e.phase === "finisher" ? "🔥 Đốt mỡ cuối buổi" : (e.muscleGroup ?? "Khác");
      groups.set(g, [...(groups.get(g) ?? []), e]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "vi"));
  }, [exercises]);

  return (
    <div className="flex flex-col gap-4">
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

      {/* Ngày tập + trạng thái tự động lưu */}
      <section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
        <label htmlFor={`${ids}-date`} className="text-sm font-medium text-muted-foreground">
          Ngày tập
        </label>
        <input
          id={`${ids}-date`}
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            const next = e.target.value;
            if (!next || next > today) return;
            flushPending();
            router.push(next === today ? "/workouts" : `/workouts?date=${next}`);
          }}
          className="h-14 w-full rounded-xl border border-border bg-background px-4 text-lg text-foreground [color-scheme:dark] focus:border-primary focus:outline-none"
        />
        <AutosaveBadge status={status} />
      </section>

      {/* ===== BÀI TẬP CHÍNH ===== */}
      <PhaseHeader id="phase-main" title="Bài tập chính" guide={PHASE_GUIDE.main} />
      {mainEntries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Chưa có bài nào. Bấm “Bắt đầu bài tập” ở trên hoặc chọn bài bên dưới.
        </p>
      )}
      {mainEntries.map((entry) => {
        const exercise = exerciseById.get(entry.exerciseId);
        return (
          <MainExerciseCard
            key={entry.key}
            entry={entry}
            exercise={exercise}
            onAddSet={() => addSet(entry)}
            onEditSet={(rowKey, patch) => editSet(entry.key, rowKey, patch)}
            onCommitSet={(rowKey) => commitSet(entry.key, rowKey)}
            onDeleteSet={(row) => deleteSet(entry, row)}
            onRemove={() => removeEntry(entry)}
            onShowInfo={(ex) => setInfo({ exercise: ex, open: true })}
            getAlternatives={(ex) => findSwapAlternatives(ex, exercises, usedIds)}
            onSwap={(toId) => swapExercise(entry, toId)}
          />
        );
      })}

      {/* Thêm bài thủ công — vào đúng khu vực theo giai đoạn mặc định của bài */}
      <section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
        <label htmlFor={`${ids}-exercise`} className="text-sm font-medium text-muted-foreground">
          Thêm bài tập
        </label>
        {exercises.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-muted-foreground">Chưa có bài tập gym nào trong hệ thống.</p>
        ) : (
          <div className="flex gap-2">
            <select
              id={`${ids}-exercise`}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-lg text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">— Chọn bài tập —</option>
              {groupedOptions.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((e) => (
                    <option key={e.id} value={e.id} disabled={usedIds.has(e.id)}>
                      {e.phase === "finisher" && finisherLabel(e.name) !== e.name ? `${finisherLabel(e.name)} (${e.name})` : e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={addExercise}
              disabled={!selectedId}
              className="h-14 shrink-0 rounded-xl bg-primary px-5 text-lg font-semibold text-primary-foreground active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
            >
              Thêm
            </button>
          </div>
        )}
      </section>

      {/* ===== ĐỐT MỠ CUỐI BUỔI ===== */}
      <PhaseHeader id="phase-finisher" title="Đốt mỡ cuối buổi (10-15 Phút)" guide={PHASE_GUIDE.finisher} />
      <FinisherSection
        entries={finisherEntries}
        exerciseById={exerciseById}
        onToggle={toggleFinisher}
        onDurationChange={(entry, duration) => patchRow(entry.key, entry.sets[0].key, { duration })}
        onDurationCommit={commitDuration}
        onRemove={removeEntry}
        onShowInfo={(ex) => setInfo({ exercise: ex, open: true })}
      />

      <section className="flex flex-col gap-2 rounded-2xl bg-card p-4">
        <label htmlFor={`${ids}-notes`} className="text-sm font-medium text-muted-foreground">
          Ghi chú buổi tập (tự lưu khi rời ô)
        </label>
        <textarea
          id={`${ids}-notes`}
          value={notes}
          maxLength={1000}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="Cảm nhận, thời gian nghỉ…"
          className="w-full rounded-xl border border-border bg-background p-3 text-base text-foreground placeholder:text-faint focus:border-primary focus:outline-none"
        />
      </section>

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
      <ExerciseInfoModal exercise={info.exercise} open={info.open} onClose={() => setInfo((i) => ({ ...i, open: false }))} />
    </div>
  );
}

/** Divider + tiêu đề lớn của 1 khu vực (BÀI TẬP CHÍNH / ĐỐT MỠ CUỐI BUỔI). */
function PhaseHeader({ id, title, guide }: { id: string; title: string; guide: string }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <h2 id={id} className="shrink-0 text-lg font-extrabold tracking-wide text-accent uppercase">
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <p className="text-sm text-muted-foreground">{guide}</p>
    </div>
  );
}

/** Trạng thái tự động lưu (thay cho nút Save cũ). */
function AutosaveBadge({ status }: { status: AutosaveStatus }) {
  const text =
    status.state === "saving"
      ? "Đang lưu…"
      : status.state === "saved"
        ? `Đã lưu lúc ${status.at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
        : status.state === "error"
          ? status.message
          : "Mọi thay đổi được lưu tự động";
  return (
    <p
      role={status.state === "error" ? "alert" : "status"}
      data-testid="autosave-status"
      data-state={status.state}
      className={`flex items-center gap-1.5 text-sm ${status.state === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      <span aria-hidden>{status.state === "error" ? "⚠️" : status.state === "saving" ? "⏳" : "☁️"}</span>
      {text}
    </p>
  );
}
