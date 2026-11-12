"use client";

import { useCallback, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action-result";

export type AutosaveStatus = { state: "idle" } | { state: "saving" } | { state: "saved"; at: Date } | { state: "error"; message: string };

/**
 * Hàng đợi lưu nền cho màn hình tập (auto-save). Giao diện cập nhật ngay (optimistic), còn lệnh lưu
 * chạy TUẦN TỰ theo thứ tự thao tác: "thêm hiệp" luôn xong trước "sửa hiệp đó", và không bao giờ có
 * 2 lệnh cùng tạo buổi tập của ngày. `save(task)` trả về kết quả để caller hoàn tác khi lỗi.
 */
export function useAutosave() {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const [status, setStatus] = useState<AutosaveStatus>({ state: "idle" });

  const save = useCallback(<T,>(task: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    pending.current += 1;
    setStatus({ state: "saving" });
    const run = queue.current.then(task).catch(
      (): ActionResult<T> => ({ ok: false, error: "Mất kết nối — thay đổi chưa được lưu, hãy thử lại." }),
    );
    queue.current = run;
    return run.then((res) => {
      pending.current -= 1;
      if (!res.ok) setStatus({ state: "error", message: res.error });
      // Thao tác lỗi đã được caller hoàn tác trên UI; lần lưu thành công kế tiếp thì xoá thông báo lỗi
      else if (pending.current === 0) setStatus({ state: "saved", at: new Date() });
      return res;
    });
  }, []);

  return { save, status };
}
