import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { AUTH_FILE } from "./e2e/helpers/constants";

// Không ghi đè env có sẵn → DATABASE_URL của Neon branch (từ scripts/e2e-neon-branch.ts) được ưu tiên.
loadEnv({ path: ".env.local", quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,

  // Lấy Clerk Testing Token + đảm bảo user test tồn tại (chạy 1 lần trong process chính).
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Đăng nhập 1 lần bằng Clerk sign-in token → lưu storageState cho các project cần auth.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "guest",
      testMatch: /guest\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "authenticated",
      testIgnore: [/guest\.spec\.ts/, /auth\.setup\.ts/],
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
    },
  ],

  // Chạy bản production (khuyến nghị trong guide Next.js) trên cổng riêng — không bao giờ
  // dùng lại dev server đang mở ở :3000 (nó trỏ vào DB chính).
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
  },
});
