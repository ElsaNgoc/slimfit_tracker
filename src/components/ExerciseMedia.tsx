"use client";

import { useState } from "react";

type Status = "loading" | "loaded" | "error";

/**
 * Ảnh tĩnh minh hoạ bài tập trong modal (đa số là ảnh ghép 2 tư thế "Bắt đầu" → "Kết thúc", 4:3).
 * - Khung cố định tỉ lệ 4:3, `object-contain` trên nền trắng → không méo, không nhảy layout trên mobile.
 * - Skeleton khi đang tải, fallback khi lỗi.
 *
 * Dùng `key={exercise.id}` ở nơi gọi để reset state khi đổi bài.
 */
export function ExerciseMedia({ src, name, credit }: { src: string | null; name: string; credit: string | null }) {
  const [status, setStatus] = useState<Status>(src ? "loading" : "error");

  return (
    <figure className="flex flex-col gap-1">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white">
        {status === "loading" && <div className="absolute inset-0 animate-pulse bg-zinc-200" aria-hidden />}

        {status === "error" || !src ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-500">
            <span className="text-4xl" aria-hidden>
              🏋️
            </span>
            <span className="text-sm">Chưa có ảnh minh hoạ</span>
          </div>
        ) : (
          // Ảnh từ nhiều nguồn (wger.de, Wikimedia, /exercises/*) → <img> thường, không qua next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Minh hoạ tư thế ${name}`}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>
      {credit && status !== "error" && (
        <figcaption className="text-right text-xs text-zinc-600">Ảnh: {credit}</figcaption>
      )}
    </figure>
  );
}
