"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { upsertWeightLog } from "@/actions/weight-logs";
import { SHEET_DIALOG_CLASS, SHEET_PANEL_CLASS } from "@/components/ui/bottom-sheet";
import { formatDayMonth } from "@/lib/date";
import { WEIGHT_MAX_KG, WEIGHT_MIN_KG, formatKg, type WeightPoint } from "@/lib/weight";

const COPY = {
  update: { title: "Cập nhật cân nặng", submit: "Lưu cân nặng" },
  baseline: { title: "Cân nặng ban đầu", submit: "Lưu & bắt đầu theo dõi" },
} as const;

/** "62,4" / "62.4" → 62.4; rỗng / sai → NaN. */
const parseKg = (raw: string) => (raw.trim() === "" ? NaN : Number(raw.trim().replace(",", ".")));

/**
 * Modal nhập cân nặng (kg + ngày). `mode` null = đóng. Ngày mặc định hôm nay, không cho chọn ngày tương lai;
 * ngày đã có số liệu → lưu là cập nhật (có nhắc). Lưu xong server `refresh()` → biểu đồ + TDEE vẽ lại.
 */
export function WeightLogModal({
  mode,
  today,
  logs,
  defaultKg,
  onClose,
}: {
  mode: "update" | "baseline" | null;
  today: string;
  logs: WeightPoint[];
  defaultKg: number | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${useId()}-title`;
  const open = mode !== null;
  // Giữ mode cuối để tiêu đề không đổi trong lúc dialog trượt xuống
  const [shownMode, setShownMode] = useState(mode ?? "update");
  // Tăng lượt mở NGAY khi render (không đợi effect) → khung hình đầu đã là form mới
  const [session, setSession] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (mode) {
      setShownMode(mode);
      setSession((s) => s + 1);
    }
  }

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
      aria-labelledby={titleId}
      // Sự kiện "close" bắn bất đồng bộ: dialog đã mở lại thì đó là sự kiện cũ → bỏ qua
      onClose={(e) => !e.currentTarget.open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={SHEET_DIALOG_CLASS}
    >
      <div className={SHEET_PANEL_CLASS}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">
            {COPY[shownMode].title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-2xl text-foreground/85 active:bg-muted/70"
          >
            ×
          </button>
        </div>
        <WeightForm
          key={session}
          mode={shownMode}
          today={today}
          logs={logs}
          defaultKg={defaultKg}
          onSaved={onClose}
        />
      </div>
    </dialog>
  );
}

function WeightForm({
  mode,
  today,
  logs,
  defaultKg,
  onSaved,
}: {
  mode: "update" | "baseline";
  today: string;
  logs: WeightPoint[];
  defaultKg: number | null;
  onSaved: () => void;
}) {
  const id = useId();
  const [kg, setKg] = useState(defaultKg !== null ? formatKg(defaultKg) : "");
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const existing = logs.find((l) => l.date === date);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseKg(kg);
    if (!Number.isFinite(value) || value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) {
      return setError(`Nhập cân nặng từ ${WEIGHT_MIN_KG} đến ${WEIGHT_MAX_KG} kg.`);
    }
    if (!date) return setError("Chọn ngày cân.");
    if (date > today) return setError("Không thể nhập cân nặng cho ngày trong tương lai.");
    setError(null);
    startTransition(async () => {
      const res = await upsertWeightLog({ date, weightKg: value });
      if (!res.ok) return setError(res.error);
      onSaved();
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {mode === "baseline" && (
        <p className="text-sm text-muted-foreground">
          Đây là điểm neo của biểu đồ — các lần cân sau sẽ so với con số này.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-kg`} className="text-sm font-medium text-foreground/85">
          Cân nặng (kg)
        </label>
        <div className="relative">
          <input
            id={`${id}-kg`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="VD: 62,5"
            value={kg}
            onChange={(e) => {
              setKg(e.target.value.replace(/[^\d.,]/g, ""));
              setError(null);
            }}
            className="h-16 w-full rounded-xl border border-border bg-background pr-12 pl-4 text-3xl font-bold text-foreground tabular-nums placeholder:text-faint focus:border-primary focus:outline-none"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">kg</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-date`} className="text-sm font-medium text-foreground/85">
          Ngày cân
        </label>
        <input
          id={`${id}-date`}
          type="date"
          max={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground [color-scheme:dark] focus:border-primary focus:outline-none"
        />
        {existing && (
          <p className="text-xs text-muted-foreground">
            Ngày {formatDayMonth(existing.date)} đã có {formatKg(existing.weightKg)} kg — lưu sẽ cập nhật số này.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground transition-colors active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
      >
        {isPending ? "Đang lưu…" : COPY[mode].submit}
      </button>
    </form>
  );
}
