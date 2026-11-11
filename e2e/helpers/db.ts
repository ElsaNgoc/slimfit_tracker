import { neon } from "@neondatabase/serverless";
import { DB_BRANCH } from "./constants";

/**
 * SQL client tới Neon branch tạm — dùng để kiểm tra / dọn dữ liệu test.
 * Từ chối kết nối nếu không chạy qua scripts/e2e-neon-branch.ts (tránh đụng DB chính).
 */
export function branchSql() {
  if (!DB_BRANCH || !process.env.DATABASE_URL) {
    throw new Error("branchSql() chỉ dùng được trên Neon branch tạm (npm run test:e2e).");
  }
  return neon(process.env.DATABASE_URL);
}
