"use client";

import { formatGram, percentOf, type NutritionTotals, type Macros } from "@/lib/nutrition";
import { useAnimatedNumber } from "@/lib/use-animated-number";

/**
 * Màu từng vòng: 4 slot categorical đầu (bản dark) của bảng màu dataviz, đã kiểm tra bằng
 * validate_palette.js trên nền zinc-900 (#18181b): đủ tương phản 3:1, tách biệt khi mù màu.
 * Mỗi vòng có tên + số liệu bằng chữ nên màu không phải kênh nhận diện duy nhất.
 */
const RINGS = [
  { key: "calories", label: "Calories", unit: "kcal", color: "#3987e5" },
  { key: "proteinG", label: "Protein", unit: "g", color: "#d95926" },
  { key: "carbsG", label: "Carbs", unit: "g", color: "#199e70" },
  { key: "fatG", label: "Fat", unit: "g", color: "#c98500" },
] as const;

export type NutritionGoals = Macros & { calories: number };

/** 4 biểu đồ vòng tròn: % hoàn thành Calories / Protein / Carbs / Fat so với mục tiêu ngày. */
export function MacroRings({ totals, goals }: { totals: NutritionTotals; goals: NutritionGoals | null }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-4 gap-2">
        {RINGS.map((r) => (
          <li key={r.key}>
            <Ring
              label={r.label}
              unit={r.unit}
              color={r.color}
              value={totals[r.key]}
              goal={goals ? goals[r.key] : null}
            />
          </li>
        ))}
      </ul>
      <p className="text-center text-xs text-zinc-500 tabular-nums">
        Chất xơ: <span data-testid="fiber-total">{formatGram(totals.fiberG)}</span> g
      </p>
    </div>
  );
}

const SIZE = 80;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Ring({
  label,
  unit,
  color,
  value,
  goal,
}: {
  label: string;
  unit: string;
  color: string;
  value: number;
  goal: number | null;
}) {
  const percent = percentOf(value, goal);
  const shownPercent = useAnimatedNumber(percent ?? 0);
  const shownValue = useAnimatedNumber(value);
  const fill = Math.min(100, Math.max(0, shownPercent)) / 100;
  const over = goal !== null && value > goal;
  const fmt = (n: number) => (unit === "kcal" ? Math.round(n).toLocaleString("vi-VN") : formatGram(n));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={goal ?? undefined}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuetext={
        goal !== null
          ? `${fmt(value)} / ${fmt(goal)} ${unit} (${percent}%)`
          : `${fmt(value)} ${unit}, chưa có mục tiêu`
      }
      data-ring={label.toLowerCase()}
      className="flex flex-col items-center gap-1.5 text-center"
    >
      <div className="relative aspect-square w-full max-w-20">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90" aria-hidden>
          {/* Rãnh: cùng hue, độ đậm thấp (meter same-ramp track) */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={STROKE} />
          {goal !== null && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
              opacity={fill === 0 ? 0 : 1}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-100 tabular-nums">
          {percent !== null ? `${Math.round(shownPercent)}%` : "–"}
        </span>
      </div>
      <span className="text-xs font-semibold text-zinc-200">{label}</span>
      <span className="text-[11px] leading-tight text-zinc-400 tabular-nums">
        <span data-testid={`ring-value-${label.toLowerCase()}`}>{fmt(shownValue)}</span>
        {goal !== null ? ` / ${fmt(goal)}` : ""} {unit}
      </span>
      {over && <span className="text-[11px] leading-tight text-zinc-400">▲ Vượt</span>}
    </div>
  );
}
