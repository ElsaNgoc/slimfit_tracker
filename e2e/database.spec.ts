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

test.describe("Dashboard → nutrition_logs + custom_foods (từ điển dinh dưỡng, vòng tròn macro)", () => {
  const DICT_FOOD = `Bún chả E2E ${Date.now().toString(36)}`;

  test.afterEach(async ({ page }) => {
    const userId = await currentUserId(page);
    await branchSql()`DELETE FROM nutrition_logs WHERE user_id = ${userId} AND date = ${today()}`;
    await branchSql()`DELETE FROM custom_foods WHERE user_id = ${userId} AND name LIKE 'Bún chả E2E%'`;
  });

  test("tìm món trong từ điển + gram, tự nhập & lưu từ điển → 2 bảng đúng, vòng tròn nhảy số, reload tìm lại được", async ({ page }) => {
    await page.goto("/");
    const userId = await currentUserId(page);
    await branchSql()`DELETE FROM nutrition_logs WHERE user_id = ${userId} AND date = ${today()}`;
    await page.reload();

    const calories = page.getByRole("progressbar", { name: "Calories" });
    const protein = page.getByRole("progressbar", { name: "Protein" });
    await expect(page.getByTestId("ring-value-calories")).toHaveText("0");

    // 1) Bữa Sáng — tìm "uc ga" (không dấu) trong từ điển tĩnh → Ức gà chín 165 kcal/100 g × 1,5 = 248 kcal
    await page.getByRole("button", { name: "Thêm món vào bữa Sáng" }).click();
    const dialog = page.getByRole("dialog", { name: "Thêm món · Bữa Sáng" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox", { name: "Tìm món ăn" }).fill("uc ga");
    await dialog.getByRole("option", { name: /Ức gà bỏ da \(chín\)/ }).click();
    const grams = dialog.getByLabel("Số lượng (gram)");
    await expect(grams).toHaveValue("100");
    await expect(dialog.getByTestId("food-calories")).toHaveText("165");
    await grams.fill("150");
    await expect(dialog.getByTestId("food-calories")).toHaveText("248");
    await expect(dialog.getByTestId("food-protein")).toHaveText("46,5");
    await expect(dialog.getByTestId("food-fat")).toHaveText("5,4");

    // Ghi lại mọi giá trị số trên vòng Calories (để kiểm tra số "nhảy" dần, không đổi cái rụp)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="ring-value-calories"]')!;
      const w = window as unknown as { __kcalSamples: string[] };
      w.__kcalSamples = [];
      new MutationObserver(() => w.__kcalSamples.push(el.textContent ?? "")).observe(el, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
    await dialog.getByRole("button", { name: "Lưu vào bữa Sáng" }).click();
    await expect(dialog).toBeHidden();

    const counter = page.getByTestId("ring-value-calories");
    await expect(counter).toHaveText("248");
    const samples = await page.evaluate(() => (window as unknown as { __kcalSamples: string[] }).__kcalSamples);
    const between = samples.map((t) => Number(t.replace(/\./g, ""))).filter((n) => n > 0 && n < 248);
    expect(between.length, `giá trị đã hiển thị: ${samples.join(", ")}`).toBeGreaterThan(3);
    await expect(protein).toHaveAttribute("aria-valuenow", "46.5");
    const breakfast = page.getByRole("region", { name: "Sáng" });
    await expect(breakfast.getByText("Ức gà bỏ da (chín)")).toBeVisible();
    await expect(breakfast.getByText(/150 g · P 46,5/)).toBeVisible();

    // 2) Bữa Trưa — tự nhập 250 g / 500 kcal + tick "Lưu món này vào từ điển của tôi"
    await page.getByRole("button", { name: "Thêm món vào bữa Trưa" }).click();
    const lunch = page.getByRole("dialog", { name: "Thêm món · Bữa Trưa" });
    await lunch.getByRole("tab", { name: "Tự nhập" }).click();
    await lunch.getByLabel(/^Tên món ăn/).fill(DICT_FOOD);
    await lunch.getByLabel(/^Calories/).fill("500");
    await lunch.getByLabel(/^Khối lượng/).fill("250");
    await lunch.getByLabel("Protein (g)").fill("25");
    await lunch.getByLabel("Carbs (g)").fill("60");
    await lunch.getByLabel("Fat (g)").fill("15");
    await lunch.getByRole("checkbox", { name: "Lưu món này vào từ điển của tôi" }).check();
    await expect(lunch.getByText("Sẽ lưu: 200 kcal · P 10 · C 24 · F 6 g / 100 g")).toBeVisible();
    await lunch.getByRole("button", { name: "Lưu vào bữa Trưa" }).click();
    await expect(lunch).toBeHidden();
    await expect(counter).toHaveText("748");
    await expect(calories).toHaveAttribute("aria-valuenow", "748");

    // DB: bữa ăn lưu phần đã ăn, từ điển lưu số liệu / 100 g
    const logs = await branchSql()`
      SELECT meal_type, food_name, weight_g, calories, protein_g, carbs_g, fat_g FROM nutrition_logs
      WHERE user_id = ${userId} AND date = ${today()} ORDER BY id`;
    expect(logs).toEqual([
      { meal_type: "breakfast", food_name: "Ức gà bỏ da (chín)", weight_g: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 },
      { meal_type: "lunch", food_name: DICT_FOOD, weight_g: 250, calories: 500, protein_g: 25, carbs_g: 60, fat_g: 15 },
    ]);
    const foods = await branchSql()`
      SELECT name, name_key, calories, protein, carbs, fat FROM custom_foods WHERE user_id = ${userId} AND name = ${DICT_FOOD}`;
    expect(foods).toEqual([
      { name: DICT_FOOD, name_key: DICT_FOOD.toLowerCase(), calories: 200, protein: 10, carbs: 24, fat: 6 },
    ]);

    // 3) Reload → Server Component đọc lại cả 2 bảng; món vừa lưu tìm được ở bữa Tối (gõ không dấu)
    await page.reload();
    await expect(page.getByTestId("ring-value-calories")).toHaveText("748");
    await page.getByRole("button", { name: "Thêm món vào bữa Tối" }).click();
    const dinner = page.getByRole("dialog", { name: "Thêm món · Bữa Tối" });
    await dinner.getByRole("combobox", { name: "Tìm món ăn" }).fill("bun cha e2e");
    const mine = dinner.getByRole("option").first();
    await expect(mine).toContainText(DICT_FOOD);
    await expect(mine).toContainText("Món của tôi");
    await mine.click();
    await dinner.getByLabel("Số lượng (gram)").fill("50");
    await expect(dinner.getByTestId("food-calories")).toHaveText("100");
    await dinner.getByRole("button", { name: "Lưu vào bữa Tối" }).click();
    await expect(dinner).toBeHidden();
    await expect(counter).toHaveText("848");

    // Lưu lại cùng tên (khác hoa thường) → cập nhật số liệu, không tạo bản trùng
    await page.getByRole("button", { name: "Thêm món vào bữa Phụ" }).click();
    const snack = page.getByRole("dialog", { name: "Thêm món · Bữa Phụ" });
    await snack.getByRole("tab", { name: "Tự nhập" }).click();
    await snack.getByLabel(/^Tên món ăn/).fill(DICT_FOOD.toUpperCase().replace("BÚN CHẢ E2E", "Bún chả E2E"));
    await snack.getByLabel(/^Calories/).fill("300");
    await snack.getByLabel(/^Khối lượng/).fill("200");
    await snack.getByRole("checkbox", { name: "Lưu món này vào từ điển của tôi" }).check();
    await snack.getByRole("button", { name: "Lưu vào bữa Phụ" }).click();
    await expect(snack).toBeHidden();
    await expect
      .poll(async () => branchSql()`SELECT calories FROM custom_foods WHERE user_id = ${userId} AND name_key = ${DICT_FOOD.toLowerCase()}`)
      .toEqual([{ calories: 150 }]);

    // Xoá món bữa Trưa
    await page.getByRole("button", { name: `Xoá ${DICT_FOOD} khỏi bữa Trưa` }).click();
    await expect(counter).toHaveText("648");
    await expect
      .poll(async () => (await branchSql()`SELECT count(*)::int AS n FROM nutrition_logs WHERE user_id = ${userId} AND date = ${today()}`)[0].n)
      .toBe(3);
  });
});

test.describe("Dashboard → habits / habit_logs (to-do list thói quen)", () => {
  const tag = `E2E ${Date.now().toString(36)}`;

  test.afterAll(async () => {
    await branchSql()`DELETE FROM habits WHERE name LIKE ${tag + "%"}`; // habit_logs xoá theo (CASCADE)
  });

  test("thêm, tick, reload, gợi ý nhanh, xoá — DB phản ánh đúng", async ({ page }) => {
    await page.goto("/");
    const userId = await currentUserId(page);
    const widget = page.getByRole("region", { name: "Thói quen hôm nay" });
    const name = `${tag} Lịch peel da HA`;

    // Thêm thói quen tự gõ
    await widget.getByLabel("Tên thói quen mới").fill(name);
    await widget.getByRole("button", { name: "Thêm thói quen" }).click();
    const box = widget.getByRole("checkbox", { name });
    await expect(box).not.toBeChecked();
    const [habit] = await branchSql()`SELECT id FROM habits WHERE user_id = ${userId} AND name = ${name}`;
    expect(habit).toBeTruthy();

    // Tick → habit_logs của hôm nay = true
    await widget.getByText(name, { exact: true }).click();
    await expect(box).toBeChecked();
    await expect(box).toBeEnabled(); // đã lưu xong
    const logsAfterTick = await branchSql()`
      SELECT date::text AS date, completed FROM habit_logs WHERE habit_id = ${habit.id}`;
    expect(logsAfterTick).toEqual([{ date: today(), completed: true }]);

    // Reload → đọc lại từ DB
    await page.reload();
    await expect(widget.getByRole("checkbox", { name })).toBeChecked();

    // Bỏ tick → cùng 1 dòng log chuyển false (upsert, không tạo thêm)
    await widget.getByText(name, { exact: true }).click();
    await expect(widget.getByRole("checkbox", { name })).not.toBeChecked();
    await expect(widget.getByRole("checkbox", { name })).toBeEnabled();
    expect(await branchSql()`SELECT completed FROM habit_logs WHERE habit_id = ${habit.id}`).toEqual([
      { completed: false },
    ]);

    // Gợi ý làm đẹp → thêm nhanh (tên gợi ý không có tag → dọn riêng)
    await branchSql()`DELETE FROM habits WHERE user_id = ${userId} AND lower(name) = lower('Uống 2L nước')`;
    await page.reload();
    await widget.getByRole("button", { name: /Gợi ý làm đẹp/ }).click();
    await widget.getByRole("button", { name: "Thêm nhanh Uống 2L nước" }).click();
    await expect(widget.getByRole("checkbox", { name: "Uống 2L nước" })).toBeVisible();
    await expect(widget.getByRole("button", { name: "Thêm nhanh Uống 2L nước" })).toHaveCount(0);
    await expect
      .poll(async () => (await branchSql()`SELECT count(*)::int AS n FROM habits WHERE user_id = ${userId} AND name = 'Uống 2L nước'`)[0].n)
      .toBe(1);
    await branchSql()`DELETE FROM habits WHERE user_id = ${userId} AND name = 'Uống 2L nước'`;

    // Xoá (xác nhận) → mất khỏi DB, log xoá theo
    page.once("dialog", (d) => d.accept());
    await widget.getByRole("button", { name: `Xoá thói quen ${name}` }).click();
    await expect(widget.getByRole("checkbox", { name })).toHaveCount(0);
    await expect
      .poll(async () => (await branchSql()`SELECT count(*)::int AS n FROM habit_logs WHERE habit_id = ${habit.id}`)[0].n)
      .toBe(0);
  });

  test("sang ngày mới checkbox tự reset: log 'đã xong' của hôm qua không làm hôm nay bị tick", async ({ page }) => {
    await page.goto("/");
    const userId = await currentUserId(page);
    const name = `${tag} Đắp mặt nạ`;
    const [habit] = await branchSql()`
      INSERT INTO habits (user_id, name) VALUES (${userId}, ${name}) RETURNING id`;
    // Hôm qua (giờ VN) đã tick
    await branchSql()`
      INSERT INTO habit_logs (habit_id, user_id, date, completed)
      VALUES (${habit.id}, ${userId}, (${today()}::date - 1), true)`;

    await page.reload();
    const widget = page.getByRole("region", { name: "Thói quen hôm nay" });
    await expect(widget.getByRole("checkbox", { name })).not.toBeChecked();

    // Tick hôm nay → dòng mới cho hôm nay, lịch sử hôm qua giữ nguyên
    await widget.getByText(name, { exact: true }).click();
    await expect(widget.getByRole("checkbox", { name })).toBeEnabled();
    const rows = await branchSql()`
      SELECT date::text AS date, completed FROM habit_logs WHERE habit_id = ${habit.id} ORDER BY date`;
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ date: today(), completed: true });
    expect(rows[0].completed).toBe(true);
  });
});

test.describe("Tập luyện → favorite_videos (video giãn cơ yêu thích)", () => {
  const YT_ID = "v7AYKMP6rOE"; // "Yoga For Complete Beginners" — Yoga With Adriene (không nằm trong danh sách gợi ý)

  test("dán link YouTube → kiểm tra qua oEmbed → lưu DB → reload còn → phát được → xoá", async ({ page }) => {
    await page.goto("/workouts#yoga-videos");
    const userId = await currentUserId(page);
    await branchSql()`DELETE FROM favorite_videos WHERE user_id = ${userId}`;
    await page.reload();

    try {
      const library = page.getByRole("region", { name: "Yoga & Giãn cơ" });
      const input = library.getByLabel("Link video YouTube");
      await expect(input).toBeEnabled();

      // Link sai → báo lỗi ngay
      await input.fill("https://vimeo.com/123456");
      await library.getByRole("button", { name: "Lưu video" }).click();
      await expect(library.getByRole("alert")).toContainText("Link không hợp lệ");

      // Link thật (dạng youtu.be + tham số chia sẻ) → xem trước thumbnail → lưu
      await input.fill(`https://youtu.be/${YT_ID}?si=share123`);
      await expect(library.getByTestId("favorite-preview").locator("img")).toHaveAttribute(
        "src",
        `https://i.ytimg.com/vi/${YT_ID}/mqdefault.jpg`,
      );
      await library.getByRole("button", { name: "Lưu video" }).click();
      await expect(library.getByRole("status")).toContainText("Đã lưu", { timeout: 15000 });
      await expect(input).toHaveValue("");

      const favs = library.getByRole("list", { name: /Video yêu thích của bạn/ });
      const card = favs.getByRole("button", { name: /^Xem video: Yoga For Complete Beginners/ });
      await expect(card).toBeVisible();

      // DB: tiêu đề + kênh lấy thật từ YouTube
      const rows = await branchSql()`
        SELECT youtube_id, title, channel FROM favorite_videos WHERE user_id = ${userId}`;
      expect(rows).toHaveLength(1);
      expect(rows[0].youtube_id).toBe(YT_ID);
      expect(rows[0].title).toMatch(/Yoga For Complete Beginners/);
      expect(rows[0].channel).toBe("Yoga With Adriene");

      // Lưu lại lần nữa → báo trùng
      await input.fill(`https://www.youtube.com/watch?v=${YT_ID}`);
      await library.getByRole("button", { name: "Lưu video" }).click();
      await expect(library.getByRole("alert")).toContainText("đã có trong danh sách yêu thích");

      // Reload → vẫn còn, thumbnail tải được, mở modal phát
      await page.reload();
      const cardAfter = page
        .getByRole("list", { name: /Video yêu thích của bạn/ })
        .getByRole("button", { name: /^Xem video: Yoga For Complete Beginners/ });
      await expect(cardAfter).toBeVisible();
      await expect
        .poll(() => cardAfter.locator("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
        .toBeGreaterThan(0);
      await cardAfter.click();
      const dialog = page.getByRole("dialog", { name: /Yoga For Complete Beginners/ });
      await expect(dialog.locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${YT_ID}\\?`));
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Xoá (xác nhận)
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: /^Xoá khỏi yêu thích: Yoga For Complete Beginners/ }).click();
      await expect(page.getByRole("list", { name: /Video yêu thích của bạn/ })).toHaveCount(0);
      await expect
        .poll(async () => (await branchSql()`SELECT count(*)::int AS n FROM favorite_videos WHERE user_id = ${userId}`)[0].n)
        .toBe(0);
    } finally {
      await branchSql()`DELETE FROM favorite_videos WHERE user_id = ${userId}`;
    }
  });
});
