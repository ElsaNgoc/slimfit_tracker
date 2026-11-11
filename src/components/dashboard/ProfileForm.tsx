"use client";

import { useId, useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { ACTIVITY_LEVELS, type ActivityLevel, type Sex } from "@/lib/energy";

export type ProfileValues = {
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  sex: Sex | null;
  birthYear: number | null;
  activityLevel: ActivityLevel | null;
};

const toStr = (n: number | null) => (n === null ? "" : String(n));
const toNum = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t === "" ? null : Number(t);
};

const inputCls =
  "h-14 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-lg text-zinc-100 tabular-nums placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none";

/** Form hồ sơ → server action `updateProfile` tính BMR/TDEE (Mifflin-St Jeor) rồi refresh Dashboard. */
export function ProfileForm({ initial, onSaved }: { initial: ProfileValues; onSaved?: () => void }) {
  const [height, setHeight] = useState(toStr(initial.heightCm));
  const [weight, setWeight] = useState(toStr(initial.weightKg));
  const [target, setTarget] = useState(toStr(initial.targetWeightKg));
  const [birthYear, setBirthYear] = useState(toStr(initial.birthYear));
  const [sex, setSex] = useState<Sex | null>(initial.sex);
  const [activity, setActivity] = useState<ActivityLevel>(initial.activityLevel ?? "light");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const heightCm = toNum(height);
    const weightKg = toNum(weight);
    const year = toNum(birthYear);
    if (!sex || heightCm === null || weightKg === null || year === null) {
      setError("Vui lòng nhập đủ giới tính, năm sinh, chiều cao và cân nặng.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateProfile({
        heightCm,
        weightKg,
        targetWeightKg: toNum(target),
        sex,
        birthYear: year,
        activityLevel: activity,
      });
      if (!res.ok) {
        const fieldMsg = res.fieldErrors && Object.values(res.fieldErrors).flat()[0];
        return setError(fieldMsg ? `${res.error} ${fieldMsg}` : res.error);
      }
      onSaved?.();
    });
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-zinc-400">Giới tính</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["female", "Nữ"],
              ["male", "Nam"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sex === value}
              onClick={() => setSex(value)}
              className={`h-14 rounded-xl border-2 text-lg font-semibold ${
                sex === value
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 active:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id={`${ids}-h`} label="Chiều cao (cm)">
          <input id={`${ids}-h`} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="160" className={inputCls} />
        </Field>
        <Field id={`${ids}-w`} label="Cân nặng (kg)">
          <input id={`${ids}-w`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="60" className={inputCls} />
        </Field>
        <Field id={`${ids}-y`} label="Năm sinh">
          <input id={`${ids}-y`} inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))} placeholder="1998" maxLength={4} className={inputCls} />
        </Field>
        <Field id={`${ids}-t`} label="Cân mục tiêu (kg)">
          <input id={`${ids}-t`} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Tuỳ chọn" className={inputCls} />
        </Field>
      </div>

      <Field id={`${ids}-a`} label="Mức độ vận động">
        <select id={`${ids}-a`} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className={inputCls}>
          {(Object.entries(ACTIVITY_LEVELS) as [ActivityLevel, { factor: number; label: string }][]).map(
            ([value, { label, factor }]) => (
              <option key={value} value={value}>
                {label} · ×{factor}
              </option>
            ),
          )}
        </select>
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="h-14 rounded-xl bg-emerald-500 text-lg font-bold text-zinc-950 active:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {isPending ? "Đang tính…" : "Lưu & tính TDEE"}
      </button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}
