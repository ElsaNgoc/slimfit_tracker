"use client";

import { useState } from "react";
import { ExerciseInfoModal, type ExerciseDetail } from "@/components/ExerciseInfoModal";

/** Danh sách tư thế yoga giãn cơ — chạm để xem ảnh + hướng dẫn. */
export function YogaLibrary({ poses }: { poses: ExerciseDetail[] }) {
  const [info, setInfo] = useState<{ exercise: ExerciseDetail | null; open: boolean }>({
    exercise: null,
    open: false,
  });

  if (poses.length === 0) return null;

  return (
    <section id="yoga-library" className="flex scroll-mt-4 flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Yoga giãn cơ</h2>
        <p className="text-sm text-zinc-500">Chạm vào tư thế để xem hướng dẫn chuẩn form.</p>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {poses.map((pose) => (
          <li key={pose.id}>
            <button
              type="button"
              onClick={() => setInfo({ exercise: pose, open: true })}
              className="flex w-full flex-col overflow-hidden rounded-2xl bg-zinc-900 text-left ring-1 ring-white/5 active:scale-[0.98] active:bg-zinc-800 transition-transform"
            >
              <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-white">
                {pose.gifUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pose.gifUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl" aria-hidden>
                    🧘
                  </span>
                )}
              </span>
              <span className="flex min-h-14 flex-col justify-center px-3 py-2">
                <span className="text-sm leading-tight font-semibold text-zinc-100">{pose.name}</span>
                {pose.muscleGroup && (
                  <span className="line-clamp-1 text-xs text-zinc-500">{pose.muscleGroup}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <ExerciseInfoModal
        exercise={info.exercise}
        open={info.open}
        onClose={() => setInfo((i) => ({ ...i, open: false }))}
      />
    </section>
  );
}
