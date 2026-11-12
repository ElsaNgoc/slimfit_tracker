"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDayMonth } from "@/lib/date";
import {
  WEIGHT_RANGES,
  daysBetween,
  formatKg,
  formatKgDelta,
  niceWeightTicks,
  pointsInRange,
  type WeightPoint,
  type WeightRangeId,
} from "@/lib/weight";
import { WeightLogModal } from "./WeightLogModal";

/**
 * Thẻ "Cân nặng" (tab Hồ sơ): số hiện tại + thay đổi so với điểm neo, line chart theo thời gian, nút cập nhật.
 * Chưa có dữ liệu → yêu cầu nhập "Cân nặng ban đầu" làm điểm neo.
 * Biểu đồ theo skill dataviz: 1 series (không legend), line 2px màu primary (≥ 3:1 trên nền background ở cả 3 theme),
 * điểm ≥ 8px có viền màu nền, lưới hairline, crosshair + tooltip (chuột + bàn phím), lọc khoảng thời gian 1 hàng phía trên,
 * "Xem dạng bảng" để đọc số không cần hover.
 */
export function WeightChart({
  logs,
  today,
  targetWeightKg,
  profileWeightKg,
}: {
  logs: WeightPoint[];
  today: string;
  targetWeightKg: number | null;
  /** Cân nặng trong hồ sơ — điền sẵn khi nhập cân nặng ban đầu. */
  profileWeightKg: number | null;
}) {
  const [modal, setModal] = useState<"update" | "baseline" | null>(null);
  const [range, setRange] = useState<WeightRangeId>("90d");
  const [view, setView] = useState<"chart" | "table">("chart");

  const baseline = logs[0] ?? null;
  const latest = logs.at(-1) ?? null;
  const todayLog = logs.find((l) => l.date === today) ?? null;
  const days = WEIGHT_RANGES.find((r) => r.id === range)!.days;
  const shown = useMemo(() => pointsInRange(logs, today, days), [logs, today, days]);

  return (
    <section aria-labelledby="weight-title" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="weight-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span aria-hidden className="text-accent">
            ⚖️
          </span>
          Cân nặng
        </h2>
        {latest && (
          <button
            type="button"
            onClick={() => setModal("update")}
            className="h-11 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors active:bg-primary/85"
          >
            {todayLog ? "Sửa cân nặng hôm nay" : "Cập nhật cân nặng hôm nay"}
          </button>
        )}
      </div>

      {!latest || !baseline ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-foreground/25 p-4">
          <p className="text-sm text-muted-foreground">
            Chưa có dữ liệu cân nặng. Nhập <span className="font-medium text-foreground">cân nặng ban đầu</span> làm điểm
            neo để bắt đầu vẽ biểu đồ.
          </p>
          <button
            type="button"
            onClick={() => setModal("baseline")}
            className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors active:bg-primary/85"
          >
            Nhập cân nặng ban đầu
          </button>
        </div>
      ) : (
        <>
          <Summary baseline={baseline} latest={latest} targetWeightKg={targetWeightKg} />

          {logs.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <div role="group" aria-label="Khoảng thời gian" className="flex gap-1 rounded-full bg-background p-1">
                {WEIGHT_RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={range === r.id}
                    onClick={() => setRange(r.id)}
                    className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                      range === r.id ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}
                className="h-9 shrink-0 rounded-full px-3 text-xs font-medium text-link underline-offset-2 hover:underline"
              >
                {view === "chart" ? "Xem dạng bảng" : "Xem biểu đồ"}
              </button>
            </div>
          )}

          {view === "table" ? (
            <WeightTable points={shown} />
          ) : shown.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-sm text-muted-foreground">
              Không có lần cân nào trong khoảng này — chọn “Tất cả”.
            </p>
          ) : (
            <LineChart points={shown} targetWeightKg={targetWeightKg} />
          )}
          {logs.length === 1 && (
            <p className="text-xs text-muted-foreground">Cập nhật thêm ở những ngày sau để thấy đường xu hướng.</p>
          )}
        </>
      )}

      <WeightLogModal
        mode={modal}
        today={today}
        logs={logs}
        defaultKg={latest?.weightKg ?? profileWeightKg}
        onClose={() => setModal(null)}
      />
    </section>
  );
}

function Summary({
  baseline,
  latest,
  targetWeightKg,
}: {
  baseline: WeightPoint;
  latest: WeightPoint;
  targetWeightKg: number | null;
}) {
  const change = latest.weightKg - baseline.weightKg;
  const toGoal = targetWeightKg !== null ? latest.weightKg - targetWeightKg : null;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <p className="flex items-baseline gap-1.5">
        <span className="text-5xl font-bold text-foreground" data-testid="weight-current">
          {formatKg(latest.weightKg)}
        </span>
        <span className="text-base text-muted-foreground">kg</span>
      </p>
      <div className="flex flex-col items-end text-right text-sm text-muted-foreground tabular-nums">
        {baseline !== latest && (
          <span data-testid="weight-change">
            <span className="font-semibold text-foreground">{formatKgDelta(change)} kg</span> từ{" "}
            {formatKg(baseline.weightKg)} kg ({formatDayMonth(baseline.date)})
          </span>
        )}
        {toGoal !== null && (
          <span>
            {toGoal > 0.05
              ? `Còn ${formatKg(toGoal)} kg tới mục tiêu ${formatKg(targetWeightKg!)} kg`
              : `Đã đạt mục tiêu ${formatKg(targetWeightKg!)} kg 🎉`}
          </span>
        )}
        <span className="text-xs">Lần cân gần nhất: {formatDayMonth(latest.date)}</span>
      </div>
    </div>
  );
}

function WeightTable({ points }: { points: WeightPoint[] }) {
  const rows = [...points].reverse(); // mới nhất trước
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl bg-background">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Lịch sử cân nặng</caption>
        <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Ngày
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cân nặng
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Thay đổi
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p, i) => {
            const prev = rows[i + 1];
            return (
              <tr key={p.date}>
                <td className="px-3 py-2 text-foreground/85">{formatDayMonth(p.date)}</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatKg(p.weightKg)} kg</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {prev ? `${formatKgDelta(p.weightKg - prev.weightKg)} kg` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Line chart (SVG) ----------

const HEIGHT = 190;
const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

/** Chiều rộng thật của khung (để vẽ SVG theo pixel → chữ trục không bị co trên mobile). */
function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function LineChart({ points, targetWeightKg }: { points: WeightPoint[]; targetWeightKg: number | null }) {
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const descId = useId();

  const values = points.map((p) => p.weightKg);
  // Mục tiêu nằm trong trục khi không quá xa dữ liệu (≤ 15 kg) — để thấy còn bao xa
  const showTarget = targetWeightKg !== null && Math.abs(targetWeightKg - values.at(-1)!) <= 15;
  const ticks = niceWeightTicks(
    Math.min(...values, showTarget ? targetWeightKg! : Infinity),
    Math.max(...values, showTarget ? targetWeightKg! : -Infinity),
  );
  const yMin = ticks[0];
  const yMax = ticks.at(-1)!;
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const first = points[0].date;
  const span = Math.max(daysBetween(first, points.at(-1)!.date), 1);

  const x = (p: WeightPoint) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (daysBetween(first, p.date) / span) * innerW;
  const y = (kg: number) => PAD.top + (1 - (kg - yMin) / (yMax - yMin)) * innerH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.at(-1)!).toFixed(1)},${PAD.top + innerH} L${x(points[0]).toFixed(1)},${PAD.top + innerH} Z`;
  const showAllDots = points.length <= 12;
  const activePoint = active !== null ? points[active] : null;

  /** Crosshair bám điểm gần nhất theo trục X — người dùng nhắm ngày, không nhắm vào đường 2px. */
  function nearest(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p) - px) < Math.abs(x(points[best]) - px)) best = i;
    });
    return best;
  }

  const xLabels = points.length === 1 ? [points[0]] : [points[0], points.at(-1)!];

  return (
    <div className="relative rounded-xl bg-background" ref={boxRef}>
      <p id={descId} className="sr-only">
        Biểu đồ cân nặng {points.length} lần cân, từ {formatKg(points[0].weightKg)} kg ngày {formatDayMonth(first)} đến{" "}
        {formatKg(points.at(-1)!.weightKg)} kg ngày {formatDayMonth(points.at(-1)!.date)}. Dùng phím mũi tên để xem từng
        lần cân.
      </p>
      <svg
        width={width}
        height={HEIGHT}
        role="group"
        aria-label="Biểu đồ cân nặng"
        aria-describedby={descId}
        tabIndex={0}
        className="block touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? (step > 0 ? -1 : points.length)) + step)));
          } else if (e.key === "Home") setActive(0);
          else if (e.key === "End") setActive(points.length - 1);
          else if (e.key === "Escape") setActive(null);
        }}
      >
        {/* Lưới hairline + nhãn trục Y (chữ dùng token chữ, không dùng màu dữ liệu) */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text
              x={PAD.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {formatKg(t)}
            </text>
          </g>
        ))}
        {xLabels.map((p, i) => (
          <text
            key={p.date}
            x={x(p)}
            y={HEIGHT - 8}
            textAnchor={xLabels.length === 1 ? "middle" : i === 0 ? "start" : "end"}
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {formatDayMonth(p.date)}
          </text>
        ))}

        {/* Mục tiêu: đường tham chiếu liền mảnh + nhãn chữ */}
        {showTarget && (
          <g data-testid="weight-target-line">
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(targetWeightKg!)}
              y2={y(targetWeightKg!)}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
            <text
              x={width - PAD.right}
              y={y(targetWeightKg!) - 5}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              Mục tiêu {formatKg(targetWeightKg!)} kg
            </text>
          </g>
        )}

        {points.length > 1 && (
          <>
            <path d={area} fill="var(--primary)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              data-testid="weight-line"
            />
          </>
        )}

        {/* Điểm: r = 4 (8px) + viền 2px màu nền để nổi trên đường */}
        {points.map((p, i) =>
          showAllDots || i === points.length - 1 ? (
            <circle
              key={p.date}
              cx={x(p)}
              cy={y(p.weightKg)}
              r={4}
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth={2}
              data-testid="weight-dot"
            />
          ) : null,
        )}

        {activePoint && (
          <g pointerEvents="none">
            <line
              x1={x(activePoint)}
              x2={x(activePoint)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--foreground)"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <circle
              cx={x(activePoint)}
              cy={y(activePoint.weightKg)}
              r={6}
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* Tooltip: giá trị là phần nổi bật, ngày là phần phụ; đọc cho trình đọc màn hình qua aria-live */}
      <div aria-live="polite" className="sr-only">
        {activePoint ? `${formatKg(activePoint.weightKg)} kg, ngày ${formatDayMonth(activePoint.date)}` : ""}
      </div>
      {activePoint && (
        <div
          role="tooltip"
          data-testid="weight-tooltip"
          className="pointer-events-none absolute top-1 rounded-lg bg-card px-2.5 py-1.5 text-center shadow-lg ring-1 ring-foreground/10"
          style={{
            left: Math.min(Math.max(x(activePoint), 48), width - 48),
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-sm font-bold text-foreground tabular-nums">{formatKg(activePoint.weightKg)} kg</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">{formatDayMonth(activePoint.date)}</p>
        </div>
      )}
    </div>
  );
}
