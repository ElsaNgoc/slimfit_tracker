import { test as setup, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { AUTH_FILE, E2E_USER } from "./helpers/constants";

setup("đăng nhập Clerk bằng sign-in token và lưu session", async ({ page }) => {
  // clerk.signIn yêu cầu đang ở 1 trang public đã tải Clerk.
  await page.goto("/");
  // emailAddress → helper tạo sign-in token qua Backend API + strategy "ticket" (không qua UI),
  // đồng thời tự gọi setupClerkTestingToken().
  await clerk.signIn({ page, emailAddress: E2E_USER.email });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /open user menu|mở menu người dùng/i })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
