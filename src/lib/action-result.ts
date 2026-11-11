import { z } from "zod";
import { UnauthorizedError } from "./auth";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Chuẩn hoá lỗi thành ActionResult để client hiển thị (không lộ chi tiết lỗi DB). */
export function toActionError(err: unknown): ActionResult<never> {
  if (err instanceof UnauthorizedError) {
    return { ok: false, error: "Bạn cần đăng nhập." };
  }
  if (err instanceof z.ZodError) {
    return {
      ok: false,
      error: "Dữ liệu không hợp lệ.",
      fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>,
    };
  }
  console.error(err);
  return { ok: false, error: "Đã có lỗi xảy ra, vui lòng thử lại." };
}
