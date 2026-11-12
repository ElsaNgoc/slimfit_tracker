"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { todayInAppTz } from "@/lib/date";

/**
 * Trang Dashboard render theo `date` (giờ VN) từ server. Nếu người dùng để trang mở qua nửa đêm
 * (hoặc quay lại tab sáng hôm sau), làm mới Server Component để lấy dữ liệu của ngày mới
 * — ví dụ checkbox thói quen về trạng thái chưa check. Component dùng dữ liệu theo ngày nên
 * đặt `key={date}` để state client được khởi tạo lại.
 */
export function useDayRollover(date: string, intervalMs = 60_000) {
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && todayInAppTz() !== date) router.refresh();
    };
    const timer = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [date, intervalMs, router]);
}
