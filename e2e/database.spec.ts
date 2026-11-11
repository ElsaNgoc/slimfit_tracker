import { test, expect, type Page } from "@playwright/test";
import { branchSql } from "./helpers/db";
import { DB_BRANCH, NEED_BRANCH_MSG } from "./helpers/constants";

/**
 * Luồng ghi DB thật qua Server Actions — chỉ chạy trên Neon branch tạm.
 * Các test idempotent (giá trị ngẫu nhiên, dọn theo tag) để chạy lại được nhiều lần trong UI mode.
 */
test.skip(!DB_BRANCH, NEED_BRANCH_MSG);
test.describe.configure({ mode: "serial" }); // cùng ghi daily_logs (user + hôm nay)

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

/** Clerk userId của session hiện tại (window.Clerk do ClerkProvider nạp). */
async function currentUserId(page: Page): Promise<string> {
  await page.waitForFunction(() => window.Clerk?.user?.id);
  return page.evaluate(() => window.Clerk.user!.id);
}

test.describe("Nhật ký tập luyện → workout_logs / workout_sets", () => {
  const tag = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test.afterAll(async () => {
    const sql = branchSql();
    await sql`DELETE FROM workout_logs WHERE notes = ${tag}`; // set bị xoá theo (ON DELETE CASCADE)
  });

  test("log 1 bài tập, lưu, rồi cập nhật — DB phản ánh đúng", async ({ page }) => {
    await page.goto("/workouts");
    const userId = await currentUserId(page);

    // Chọn bài + nhập 3 set × 8 rep × 42,5 kg (dấu phẩy kiểu VN)
    await page.getByLabel("Thêm bài tập gym").selectOption({ label: "Bench Press" });
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await expect(page.getByRole("button", { name: "Xem hướng dẫn Bench Press" })).toBeVisible();

    await page.getByLabel("Số set").fill("3");
    await page.getByLabel("Số rep").fill("8");
    await page.getByLabel("Tạ (kg)").fill("42,5");
    await page.getByRole("button", { name: "+ Add Set" }).click();

    const setRows = page.getByRole("listitem").filter({ hasText: "8 rep × 42.5 kg" });
    await expect(setRows).toHaveCount(3);

    await page.getByLabel("Ghi chú (tuỳ chọn)").fill(tag);
    await page.getByRole("button", { name: "Save Workout · 3 set" }).click();

    await expect(page.getByRole("status")).toHaveText("Đã lưu 3 set (1 bài tập).");
    await expect(page.getByRole("button", { name: "Cập nhật · 3 set" })).toBeVisible();

    // Kiểm tra DB thật
    const sql = branchSql();
    const rows = await sql`
      SELECT wl.id, wl.user_id, wl.date::text AS date, e.name, ws.set_number, ws.reps, ws.weight
      FROM workout_logs wl
      JOIN workout_sets ws ON ws.workout_log_id = wl.id
      JOIN exercises e ON e.id = ws.exercise_id
      WHERE wl.notes = ${tag}
      ORDER BY ws.set_number`;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    for (const [i, r] of rows.entries()) {
      expect(r).toMatchObject({ user_id: userId, date: today(), name: "Bench Press", set_number: i + 1, reps: 8, weight: 42.5 });
    }

    // Xoá set 3 → "Cập nhật" → saveWorkoutSets thay toàn bộ danh sách set, không tạo log mới
    await page.getByRole("button", { name: "Xoá set 3" }).click();
    await page.getByRole("button", { name: "Cập nhật · 2 set" }).click();
    await expect(page.getByRole("status")).toHaveText("Đã lưu 2 set (1 bài tập).");

    const after = await sql`
      SELECT count(DISTINCT wl.id)::int AS logs, count(ws.id)::int AS sets
      FROM workout_logs wl LEFT JOIN workout_sets ws ON ws.workout_log_id = wl.id
      WHERE wl.notes = ${tag}`;
    expect(after[0]).toEqual({ logs: 1, sets: 2 });
  });
});

test.describe("Dashboard → daily_logs (round-trip UI ↔ DB)", () => {
  test("nhập calo, reload — Server Component đọc lại đúng giá trị từ DB", async ({ page }) => {
    const calories = 1200 + Math.floor(Math.random() * 800);
    await page.goto("/");
    const userId = await currentUserId(page);

    const input = page.getByLabel("Tổng lượng Calo nạp vào hôm nay");
    await input.fill(String(calories));
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Đã lưu.");

    const [row] = await branchSql()`
      SELECT total_calories FROM daily_logs WHERE user_id = ${userId} AND date = ${today()}`;
    expect(row.total_calories).toBe(calories);

    await page.reload();
    await expect(page.getByLabel("Tổng lượng Calo nạp vào hôm nay")).toHaveValue(String(calories));
  });

  test("tick Yoga habit, reload — trạng thái giữ nguyên từ DB", async ({ page }) => {
    await page.goto("/");
    const userId = await currentUserId(page);

    const box = page.getByRole("checkbox", { name: /Đã tập Yoga giãn cơ/ });
    const before = await box.isChecked();
    // input sr-only → bấm vào label bao quanh như người dùng thật
    await page.getByText("Đã tập Yoga giãn cơ 30 phút tối nay").click();
    await expect(box).toBeChecked({ checked: !before });
    await expect(box).toBeEnabled(); // transition xong (đã lưu)

    const [row] = await branchSql()`
      SELECT yoga_completed FROM daily_logs WHERE user_id = ${userId} AND date = ${today()}`;
    expect(row.yoga_completed).toBe(!before);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: /Đã tập Yoga giãn cơ/ })).toBeChecked({ checked: !before });
  });
});
