import { test, expect } from "@playwright/test";

/** Khách (chưa đăng nhập) — kiểm tra màng lọc `clerkMiddleware` trong src/proxy.ts. */

test("Dashboard `/` (public) render landing cho khách", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1, name: "Slimfit Tracker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bắt đầu miễn phí" })).toBeVisible();
  // Không lộ dữ liệu của user
  await expect(page.getByText("Tổng quan hôm nay")).toHaveCount(0);
});

test("route bảo vệ `/workouts` chuyển hướng khách sang trang đăng nhập Clerk", async ({ page }) => {
  await page.goto("/workouts");

  // auth.protect() redirect tới sign-in (Account Portal của dev instance) kèm redirect_url quay lại.
  await expect(page).toHaveURL(/sign-in/);
  const url = new URL(page.url());
  expect(url.searchParams.get("redirect_url") ?? "").toContain("/workouts");
  await expect(page.getByText("Ghi chép tập luyện")).toHaveCount(0);
});

test("API bảo vệ `/api/exercises` không trả dữ liệu cho khách", async ({ request }) => {
  const res = await request.get("/api/exercises", { maxRedirects: 0 });
  // auth.protect() của Clerk redirect mọi request chưa đăng nhập (kể cả API) sang trang sign-in.
  expect(res.status()).toBe(307);
  expect(res.headers()["x-clerk-auth-status"]).toBe("signed-out");
  const location = new URL(res.headers()["location"]);
  expect(location.pathname).toBe("/sign-in");
  expect(location.searchParams.get("redirect_url")).toContain("/api/exercises");
  expect(await res.text()).not.toContain('"data"');
});
