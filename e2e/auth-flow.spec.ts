import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { E2E_USER } from "./helpers/constants";

/** Luồng xác thực Clerk qua middleware src/proxy.ts (không cần DB). */

test("session đã lưu (storageState) vào thẳng route bảo vệ, không bị đẩy sang sign-in", async ({ page }) => {
  await setupClerkTestingToken({ page });
  const res = await page.goto("/workouts");

  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ghi chép tập luyện" })).toBeVisible();
});

test.describe("phiên riêng (không dùng storageState chung)", () => {
  // Phiên mới để signOut không thu hồi session mà các test khác đang dùng.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("khách → bị chặn; đăng nhập → vào được; đăng xuất → bị chặn lại", async ({ page }) => {
    await setupClerkTestingToken({ page });

    await page.goto("/workouts");
    await expect(page).toHaveURL(/sign-in/);

    await page.goto("/");
    await clerk.signIn({ page, emailAddress: E2E_USER.email });

    await page.goto("/workouts");
    await expect(page).toHaveURL(/\/workouts$/);
    await expect(page.getByRole("heading", { level: 1, name: "Ghi chép tập luyện" })).toBeVisible();

    await page.goto("/");
    await clerk.signOut({ page });
    await page.goto("/workouts");
    await expect(page).toHaveURL(/sign-in/);
  });
});
