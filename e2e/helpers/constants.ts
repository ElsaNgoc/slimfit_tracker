/** User test trên Clerk dev instance. Hậu tố `+clerk_test` = email test của Clerk (không gửi mail thật). */
export const E2E_USER = {
  email: "slimfit-e2e+clerk_test@example.com",
  password: "Slimfit-E2E-only-pw!2026",
};

/** Các test đọc/ghi DB chỉ chạy khi DATABASE_URL trỏ vào Neon branch tạm (`npm run test:e2e`). */
export const DB_BRANCH = process.env.E2E_DB_BRANCH;
export const NEED_BRANCH_MSG =
  "Cần Neon branch tạm — chạy qua `npm run test:e2e` (scripts/e2e-neon-branch.ts).";

export const AUTH_FILE = "playwright/.auth/user.json";
