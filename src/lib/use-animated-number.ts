"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Số "nhảy" mượt từ giá trị cũ sang giá trị mới (ease-out) mỗi khi `target` đổi.
 * Lần render đầu trả đúng `target` (khớp HTML server, không lệch hydration).
 * Tôn trọng `prefers-reduced-motion`: đổi ngay, không animate.
 */
export function useAnimatedNumber(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  // Giá trị đang hiển thị — đổi target giữa chừng thì chạy tiếp từ đây, không nhảy cóc.
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reduce ? 0 : durationMs;
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb: () => void) => window.setTimeout(cb, 16);
    const cancel = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : window.clearTimeout;

    let frame = 0;
    const start = performance.now();
    // Đo bằng performance.now(), không dùng timestamp của rAF: timestamp đó là mốc đầu frame,
    // có thể sớm hơn `start` → t âm → số vọt sai chiều.
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = duration === 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
      const eased = 1 - (1 - t) ** 3;
      shownRef.current = t === 1 ? target : from + (target - from) * eased;
      setValue(shownRef.current);
      if (t < 1) frame = raf(tick);
    };
    frame = raf(tick);
    return () => cancel(frame);
  }, [target, durationMs]);

  return value;
}
