"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deleteCustomFood } from "@/actions/custom-foods";
import { formatGram } from "@/lib/nutrition";
import { foldVietnamese, type CustomFoodRow } from "@/lib/food-search";
import { EditCustomFoodModal } from "./EditCustomFoodModal";

/** Hiện ô lọc khi danh sách dài hơn mức này. */
const FILTER_THRESHOLD = 6;

const byName = (a: CustomFoodRow, b: CustomFoodRow) => a.name.localeCompare(b.name, "vi");

/**
 * "Từ điển món ăn của tôi" (trang Hồ sơ): xem / sửa / xoá các món đã lưu bằng
 * "Lưu món này vào từ điển của tôi". State giữ ở client → sửa / xoá cập nhật ngay, xoá optimistic + hoàn tác khi lỗi.
 */
export function CustomFoodManager({ initialFoods }: { initialFoods: CustomFoodRow[] }) {
  const [foods, setFoods] = useState(() => [...initialFoods].sort(byName));
  const [editing, setEditing] = useState<CustomFoodRow | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = foldVietnamese(filter);
    return q ? foods.filter((f) => foldVietnamese(f.name).includes(q)) : foods;
  }, [foods, filter]);

  function remove(food: CustomFoodRow) {
    if (!window.confirm(`Xoá "${food.name}" khỏi từ điển? Các bữa ăn đã ghi trước đó vẫn giữ nguyên.`)) return;
    setError(null);
    setFoods((list) => list.filter((f) => f.id !== food.id)); // optimistic
    startTransition(async () => {
      const res = await deleteCustomFood(food.id);
      if (!res.ok) {
        setFoods((list) => [...list, food].sort(byName)); // hoàn tác
        setError(res.error);
      }
    });
  }

  return (
    <section aria-labelledby="custom-foods-title" className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="custom-foods-title" className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          <span aria-hidden>📖</span>
          Từ điển món ăn của tôi
        </h2>
        {foods.length > 0 && (
          <span className="text-sm text-zinc-500 tabular-nums" data-testid="custom-food-count">
            {foods.length} món
          </span>
        )}
      </div>

      {foods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
          Chưa có món nào. Khi thêm món ở{" "}
          <Link href="/" className="font-medium text-emerald-400 underline-offset-2 hover:underline">
            Tổng quan
          </Link>
          , chọn “Tự nhập” và tick <span className="text-zinc-200">“Lưu món này vào từ điển của tôi”</span> để lưu món
          vào đây.
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500">Số liệu tính trên 100 g · tìm thấy khi thêm món ở Tổng quan.</p>
          {foods.length > FILTER_THRESHOLD && (
            <input
              type="search"
              aria-label="Lọc món trong từ điển"
              placeholder="Lọc món…"
              autoComplete="off"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          {visible.length === 0 ? (
            <p className="py-2 text-sm text-zinc-500">Không có món nào khớp “{filter.trim()}”.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-800 rounded-xl bg-zinc-950" aria-label="Món đã lưu">
              {visible.map((food) => (
                <li key={food.id} className="flex items-center gap-1 py-1.5 pr-1 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-100">{food.name}</p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      <span className="font-semibold text-zinc-300">{food.calories.toLocaleString("vi-VN")} kcal</span>
                      {" · "}P {formatGram(food.proteinG)} · C {formatGram(food.carbsG)} · F {formatGram(food.fatG)} g
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(food)}
                    aria-label={`Sửa ${food.name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-100 active:bg-zinc-800"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(food)}
                    aria-label={`Xoá ${food.name}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-red-400 active:bg-zinc-800"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <EditCustomFoodModal
        food={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setFoods((list) => list.map((f) => (f.id === updated.id ? updated : f)).sort(byName));
          setEditing(null);
        }}
      />
    </section>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
