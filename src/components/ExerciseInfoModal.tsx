"use client";

import { useEffect, useRef } from "react";
import { ExerciseMedia } from "@/components/ExerciseMedia";

export type ExerciseDetail = {
  id: number;
  name: string;
  category: "gym" | "yoga";
  muscleGroup: string | null;
  instruction: string | null;
  gifUrl: string | null;
  imageCredit: string | null;
  /** Mức tạ khởi điểm gợi ý, ví dụ "20–30 kg". */
  recommendedWeight?: string | null;
  /** Mẹo ngắn hiển thị trên thẻ bài tập. */
  tips?: string | null;
};

const SWIPE_CLOSE_PX = 90;

/**
 * Modal hướng dẫn bài tập. Dùng <dialog> native (Esc, focus trap, backdrop có sẵn).
 * Mobile: bottom sheet trượt lên, vuốt xuống ở phần đầu hoặc chạm nền tối để đóng.
 * Desktop (sm+): hộp thoại giữa màn hình.
 *
 * `open` tách khỏi `exercise` để giữ nội dung trong lúc chạy animation đóng.
 */
export function ExerciseInfoModal({
  exercise,
  open,
  onClose,
}: {
  exercise: ExerciseDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  // Đồng bộ prop `open` với trạng thái dialog + khoá cuộn trang phía sau.
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

  // ----- Vuốt xuống để đóng (chỉ ở vùng tay nắm / tiêu đề) -----
  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;
    sheetRef.current.style.transition = "";
    sheetRef.current.style.transform = "";
    if (dy > SWIPE_CLOSE_PX) onClose();
  }

  const steps = (exercise?.instruction ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const tips = steps.filter((l) => /^lưu ý:/i.test(l)).map((l) => l.replace(/^lưu ý:\s*/i, ""));
  const mainSteps = steps.filter((l) => !/^lưu ý:/i.test(l));
  const muscles = (exercise?.muscleGroup ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="exercise-info-title"
      // Sự kiện "close" bắn bất đồng bộ: nếu dialog đã được mở lại (bấm mở ngay sau khi đóng) thì đó là sự kiện cũ → bỏ qua
      onClose={(e) => !e.currentTarget.open && onClose()}
      onCancel={(e) => {
        e.preventDefault(); // để parent điều khiển `open`
        onClose();
      }}
      // Chạm vào nền tối (chính phần tử dialog, ngoài sheet) để đóng
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="group mx-auto mt-auto mb-0 h-auto max-h-[92dvh] w-full max-w-full overflow-visible bg-transparent p-0 text-zinc-100 opacity-0 transition-all transition-discrete duration-300 ease-out backdrop:bg-black/70 backdrop:opacity-0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-300 open:opacity-100 open:backdrop:opacity-100 sm:my-auto sm:max-w-lg starting:open:opacity-0 starting:open:backdrop:opacity-0"
    >
      <div
        ref={sheetRef}
        className="flex max-h-[92dvh] translate-y-full flex-col overflow-hidden rounded-t-3xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 transition-transform duration-300 ease-out group-open:translate-y-0 sm:translate-y-8 sm:rounded-3xl sm:group-open:translate-y-0 starting:group-open:translate-y-full sm:starting:group-open:translate-y-8"
      >
        {/* Tay nắm + tiêu đề: vùng vuốt để đóng */}
        <div
          className="shrink-0 touch-none px-4 pt-2 pb-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-zinc-700 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-1">
              <span className="text-xs font-semibold tracking-wide text-emerald-400 uppercase">
                {exercise?.category === "yoga" ? "Yoga" : "Gym"}
              </span>
              <h2 id="exercise-info-title" className="text-xl leading-tight font-bold">
                {exercise?.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-2xl text-zinc-300 active:bg-zinc-700"
            >
              ×
            </button>
          </div>
        </div>

        {/* Nội dung cuộn được */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4">
          {exercise && (
            <ExerciseMedia
              key={exercise.id}
              src={exercise.gifUrl}
              name={exercise.name}
              credit={exercise.imageCredit}
            />
          )}

          {muscles.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-400">Nhóm cơ tác động</h3>
              <ul className="flex flex-wrap gap-2">
                {muscles.map((m) => (
                  <li
                    key={m}
                    className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mainSteps.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-zinc-400">Cách thực hiện</h3>
              <ol className="flex flex-col gap-3">
                {mainSteps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-base leading-relaxed text-zinc-200">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <p className="text-zinc-500">Chưa có hướng dẫn cho bài tập này.</p>
          )}

          {tips.map((tip, i) => (
            <p
              key={i}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200"
            >
              <span className="font-semibold">💡 Lưu ý: </span>
              {tip}
            </p>
          ))}
        </div>

        {/* Nút đóng to ở vùng ngón cái */}
        <div className="shrink-0 border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="h-14 w-full rounded-xl bg-zinc-800 text-lg font-semibold text-zinc-100 active:bg-zinc-700"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </dialog>
  );
}
