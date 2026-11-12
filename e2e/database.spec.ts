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

test.describe("Nhật ký tập luyện → workout_logs / workout_sets (tự động lưu)", () => {
  const tag = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  test("không có nút Save: thêm / sửa / xoá hiệp, tick đốt mỡ, ghi chú → DB cập nhật ngay; reload dựng lại đúng", async ({ page }, testInfo) => {
    await page.goto("/workouts");
    const userId = await currentUserId(page);
    const sql = branchSql();
    await sql`DELETE FROM workout_logs WHERE user_id = ${userId} AND date = ${today()}`;
    await page.reload();
    await expect(page.getByRole("button", { name: /Save Workout|Cập nhật ·/ })).toHaveCount(0);

    /** Mọi set của buổi tập hôm nay (đọc thẳng Neon branch). */
    const dbSets = () => sql`
      SELECT e.name, ws.phase, ws.set_number, ws.reps, ws.weight, ws.duration_sec, ws.completed
      FROM workout_logs wl
      JOIN workout_sets ws ON ws.workout_log_id = wl.id
      JOIN exercises e ON e.id = ws.exercise_id
      WHERE wl.user_id = ${userId} AND wl.date = ${today()}
      ORDER BY ws.id`;
    const status = page.getByTestId("autosave-status");

    // ----- BÀI TẬP CHÍNH: Bench Press -----
    await page.getByLabel("Thêm bài tập").selectOption({ label: "Bench Press" });
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    const card = page.getByRole("region", { name: "Bench Press" });
    await expect(card).toHaveAttribute("data-phase", "main");

    // Hiệp 1: bấm "+ Thêm hiệp" → ghi DB ngay (mặc định 10 rep, BW); sửa thành 8 rep × 42,5 kg rồi rời ô
    await card.getByRole("button", { name: "+ Thêm hiệp" }).click();
    await card.getByLabel("Số rep hiệp 1").fill("8");
    await card.getByLabel("Tạ (kg) hiệp 1").fill("42,5");
    await card.getByLabel("Tạ (kg) hiệp 1").blur();
    // Hiệp 2, 3 chép số của hiệp trước
    await card.getByRole("button", { name: "+ Thêm hiệp" }).click();
    await card.getByRole("button", { name: "+ Thêm hiệp" }).click();
    await expect(card.getByLabel("Tạ (kg) hiệp 3")).toHaveValue("42,5");
    await expect(status).toHaveText(/Đã lưu lúc/);
    await expect.poll(dbSets).toEqual(
      [1, 2, 3].map((n) => ({ name: "Bench Press", phase: "main", set_number: n, reps: 8, weight: 42.5, duration_sec: null, completed: false })),
    );
    // Chỉ 1 buổi tập cho hôm nay dù ghi nhiều lần
    expect((await sql`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = ${userId} AND date = ${today()}`)[0].n).toBe(1);

    // Xoá hiệp 3 → DB còn 2
    await card.getByRole("button", { name: "Xoá hiệp 3" }).click();
    await expect.poll(async () => (await dbSets()).length).toBe(2);

    // Gõ kg hiệp 1 rồi DỪNG (không rời ô) → tự lưu sau ~0,7 giây
    await card.getByLabel("Tạ (kg) hiệp 1").fill("45");
    await expect.poll(async () => (await dbSets())[0].weight, { timeout: 5000 }).toBe(45);

    // ----- ĐỐT MỠ CUỐI BUỔI: Plank -----
    await page.getByLabel("Thêm bài tập").selectOption({ label: "Plank" });
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    const plank = page.getByRole("checkbox", { name: /Plank/ });
    await plank.check();
    await expect.poll(async () => (await dbSets()).find((r) => r.name === "Plank")).toMatchObject({
      phase: "finisher",
      reps: null,
      weight: null,
      completed: true,
    });
    await page.getByLabel("Thời gian (giây) — Plank").fill("45");
    await page.getByLabel("Thời gian (giây) — Plank").blur();
    await expect.poll(async () => (await dbSets()).find((r) => r.name === "Plank")?.duration_sec).toBe(45);

    // Ghi chú lưu khi rời ô
    await page.getByLabel(/Ghi chú buổi tập/).fill(tag);
    await page.getByLabel(/Ghi chú buổi tập/).blur();
    await expect
      .poll(async () => (await sql`SELECT notes FROM workout_logs WHERE user_id = ${userId} AND date = ${today()}`)[0]?.notes)
      .toBe(tag);

    // ----- Reload: buổi tập dựng lại từ DB -----
    await page.reload();
    const after = page.getByRole("region", { name: "Bench Press" });
    await expect(after.getByTestId("set-row")).toHaveCount(2);
    await expect(after.getByLabel("Tạ (kg) hiệp 1")).toHaveValue("45");
    await expect(after.getByLabel("Tạ (kg) hiệp 2")).toHaveValue("42,5");
    await expect(page.getByRole("checkbox", { name: /Plank/ })).toBeChecked();
    await expect(page.getByLabel("Thời gian (giây) — Plank")).toHaveValue("45");
    await expect(page.getByLabel(/Ghi chú buổi tập/)).toHaveValue(tag);
    // Ảnh chụp để kiểm tra bằng mắt bố cục thẻ bài chính + khu đốt mỡ trên màn hình hẹp
    await after.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("workout-main.png") });
    await page.getByRole("heading", { name: "Đốt mỡ cuối buổi (10-15 Phút)" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: testInfo.outputPath("workout-finisher.png") });

    // Bỏ tick sau reload → cập nhật đúng dòng cũ (không tạo dòng mới)
    await page.getByRole("checkbox", { name: /Plank/ }).uncheck();
    await expect.poll(async () => (await dbSets()).filter((r) => r.name === "Plank")).toEqual([
      expect.objectContaining({ completed: false, duration_sec: 45 }),
    ]);

    // Bỏ bài (có xác nhận) → mọi hiệp của bài bị xoá khỏi DB
    page.once("dialog", (d) => d.accept());
    await after.getByRole("button", { name: "Xoá bài Bench Press" }).click();
    await expect.poll(async () => (await dbSets()).filter((r) => r.name === "Bench Press")).toHaveLength(0);

    await sql`DELETE FROM workout_logs WHERE user_id = ${userId} AND date = ${today()}`;
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

test.describe("Hồ sơ → /profile/foods: Từ điển món ăn của tôi (custom_foods: xem / sửa / xoá)", () => {
  const tag = `Từ điển E2E ${Date.now().toString(36)}`;

  test.afterEach(async ({ page }) => {
    const userId = await currentUserId(page);
    await branchSql()`DELETE FROM custom_foods WHERE user_id = ${userId} AND name LIKE ${tag + "%"}`;
  });

  test("hiển thị món đã lưu → sửa (điền sẵn) → DB cập nhật → xoá có xác nhận → DB mất dòng", async ({ page }) => {
    await page.goto("/profile/foods");
    const userId = await currentUserId(page);
    const nameA = `${tag} Bún chả`;
    const nameB = `${tag} Cơm tấm`;
    await branchSql()`
      INSERT INTO custom_foods (user_id, name, name_key, calories, protein, carbs, fat) VALUES
        (${userId}, ${nameA}, ${nameA.toLowerCase()}, 200, 10, 24, 6),
        (${userId}, ${nameB}, ${nameB.toLowerCase()}, 180, 9.5, 22, 6)`;
    await page.reload();

    const section = page.getByRole("region", { name: "Từ điển món ăn của tôi" });
    await expect(section).toBeVisible();
    const rowA = section.getByRole("listitem").filter({ hasText: nameA });
    await expect(rowA).toContainText("200 kcal · P 10 · C 24 · F 6 g");
    await expect(section.getByRole("listitem").filter({ hasText: nameB })).toContainText("180 kcal · P 9,5 · C 22 · F 6 g");

    // Sửa: modal điền sẵn → đổi tên + calo + protein
    await section.getByRole("button", { name: `Sửa ${nameA}` }).click();
    const dialog = page.getByRole("dialog", { name: "Sửa món" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Tên món ăn/)).toHaveValue(nameA);
    await expect(dialog.getByLabel(/^Calories/)).toHaveValue("200");
    await expect(dialog.getByLabel("Protein (g)")).toHaveValue("10");
    const renamed = `${tag} Bún chả Hà Nội`;
    await dialog.getByLabel(/^Tên món ăn/).fill(renamed);
    await dialog.getByLabel(/^Calories/).fill("210");
    await dialog.getByLabel("Protein (g)").fill("11,5");
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("listitem").filter({ hasText: renamed })).toContainText("210 kcal · P 11,5 · C 24 · F 6 g");

    expect(
      await branchSql()`SELECT name, name_key, calories, protein, carbs, fat FROM custom_foods WHERE user_id = ${userId} AND name LIKE ${tag + "%"} ORDER BY name`,
    ).toEqual([
      { name: renamed, name_key: renamed.toLowerCase(), calories: 210, protein: 11.5, carbs: 24, fat: 6 },
      { name: nameB, name_key: nameB.toLowerCase(), calories: 180, protein: 9.5, carbs: 22, fat: 6 },
    ]);

    // Đổi tên trùng món khác (khác hoa thường) → báo lỗi, DB không đổi
    await section.getByRole("button", { name: `Sửa ${renamed}` }).click();
    await dialog.getByLabel(/^Tên món ăn/).fill(nameB.toUpperCase());
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Từ điển đã có một món khác cùng tên.");
    await dialog.getByRole("button", { name: "Đóng" }).click();
    await expect(dialog).toBeHidden();

    // Xoá: lần đầu bấm Huỷ ở hộp xác nhận → vẫn còn; lần 2 OK → mất cả trên UI lẫn DB
    page.once("dialog", (d) => d.dismiss());
    await section.getByRole("button", { name: `Xoá ${nameB}` }).click();
    await expect(section.getByRole("listitem").filter({ hasText: nameB })).toBeVisible();

    page.once("dialog", (d) => {
      expect(d.type()).toBe("confirm");
      expect(d.message()).toContain(nameB);
      return d.accept();
    });
    await section.getByRole("button", { name: `Xoá ${nameB}` }).click();
    await expect(section.getByRole("listitem").filter({ hasText: nameB })).toHaveCount(0);
    await expect
      .poll(async () => (await branchSql()`SELECT count(*)::int AS n FROM custom_foods WHERE user_id = ${userId} AND name LIKE ${tag + "%"}`)[0].n)
      .toBe(1);

    // Reload: đọc lại từ DB
    await page.reload();
    await expect(page.getByRole("region", { name: "Từ điển món ăn của tôi" }).getByText(renamed)).toBeVisible();
    await expect(page.getByText(nameB)).toHaveCount(0);
  });
});

/** Ngày theo giờ VN, lùi `n` ngày so với hôm nay. */
const daysAgo = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.now() - n * 86_400_000));

// Cùng ghi weight_logs / users.weight của user E2E → chạy tuần tự
test.describe.serial("Hồ sơ → weight_logs (biểu đồ cân nặng) + theme giao diện", () => {
  test("chưa có dữ liệu → nhập cân nặng ban đầu → cập nhật hôm nay → DB + users.weight + đường biểu đồ", async ({ page }) => {
    await page.goto("/profile");
    const userId = await currentUserId(page);
    await branchSql()`DELETE FROM weight_logs WHERE user_id = ${userId}`;
    await page.reload();

    const card = page.getByRole("region", { name: "Cân nặng" });
    await expect(card).toContainText("Chưa có dữ liệu cân nặng");

    // 1) Điểm neo: 64,5 kg cách đây 7 ngày
    await card.getByRole("button", { name: "Nhập cân nặng ban đầu" }).click();
    const baseline = page.getByRole("dialog", { name: "Cân nặng ban đầu" });
    await baseline.getByLabel("Cân nặng (kg)").fill("64,5");
    await baseline.getByLabel("Ngày cân").fill(daysAgo(7));
    await baseline.getByRole("button", { name: "Lưu & bắt đầu theo dõi" }).click();
    await expect(baseline).toBeHidden();
    await expect(card.getByTestId("weight-current")).toHaveText("64,5");

    // 2) Hôm nay: 63,2 kg → đường xu hướng + thay đổi so với điểm neo
    await card.getByRole("button", { name: "Cập nhật cân nặng hôm nay" }).click();
    const update = page.getByRole("dialog", { name: "Cập nhật cân nặng" });
    await expect(update.getByLabel("Cân nặng (kg)")).toHaveValue("64,5"); // điền sẵn số gần nhất
    await update.getByLabel("Cân nặng (kg)").fill("63,2");
    await update.getByRole("button", { name: "Lưu cân nặng" }).click();
    await expect(update).toBeHidden();
    await expect(card.getByTestId("weight-current")).toHaveText("63,2");
    await expect(card.getByTestId("weight-change")).toContainText("−1,3 kg từ 64,5 kg");
    await expect(card.getByTestId("weight-line")).toBeVisible();
    await expect(card.getByRole("button", { name: "Sửa cân nặng hôm nay" })).toBeVisible();

    expect(
      await branchSql()`SELECT date::text AS date, weight_kg FROM weight_logs WHERE user_id = ${userId} ORDER BY date`,
    ).toEqual([
      { date: daysAgo(7), weight_kg: 64.5 },
      { date: daysAgo(0), weight_kg: 63.2 },
    ]);
    // Cân nặng mới nhất đồng bộ vào hồ sơ
    expect((await branchSql()`SELECT weight FROM users WHERE id = ${userId}`)[0].weight).toBe(63.2);

    // Chạm vào biểu đồ → crosshair + tooltip của lần cân gần nhất
    const chart = card.getByRole("group", { name: "Biểu đồ cân nặng" });
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await expect(card.getByTestId("weight-tooltip")).toContainText("63,2 kg");

    // Reload: Server Component đọc lại từ DB
    await page.reload();
    await expect(page.getByRole("region", { name: "Cân nặng" }).getByTestId("weight-current")).toHaveText("63,2");
  });

  test("đổi theme ở Cài đặt giao diện → màu thật của trang đổi, lưu qua reload và các trang khác; chụp 3 theme", async ({ page }, testInfo) => {
    const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.goto("/profile/appearance");
    await expect(page.getByRole("radio", { name: /^Lửa/ })).toHaveAttribute("aria-checked", "true");
    await expect.poll(bodyBg).toBe("rgb(29, 15, 12)");

    await page.getByRole("radio", { name: /^Biển/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cool");
    await expect.poll(bodyBg).toBe("rgb(30, 56, 66)"); // chờ transition 300 ms
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1e3842");

    // Reload: script trong <head> áp theme đã lưu trước khi vẽ
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "cool");
    await expect(page.getByRole("radio", { name: /^Biển/ })).toHaveAttribute("aria-checked", "true");

    // Trang khác dùng chung token: card ở Tổng quan mang màu card của theme Biển
    await page.goto("/");
    await expect
      .poll(() => page.getByRole("region", { name: "Thói quen hôm nay" }).evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(41, 92, 105)");

    // Ảnh chụp để kiểm tra bằng mắt (test-results/…)
    for (const theme of ["warm", "cool", "vibrant"] as const) {
      await page.evaluate((t) => localStorage.setItem("slimfit-theme", t), theme);
      for (const [name, path] of [
        ["tong-quan", "/"],
        ["ho-so", "/profile"],
        ["giao-dien", "/profile/appearance"],
        ["tap-luyen", "/workouts"],
      ] as const) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${name}.png`), fullPage: true });
      }
    }
    // Mở modal Thêm món ở theme cuối (Neon) để xem form + dropdown
    await page.goto("/");
    await page.getByRole("button", { name: "Thêm món vào bữa Sáng" }).click();
    await page.getByRole("combobox", { name: "Tìm món ăn" }).fill("uc ga");
    await page.waitForTimeout(500); // chờ animation mở bottom sheet (300 ms) để ảnh không bị mờ giữa chừng
    await page.screenshot({ path: testInfo.outputPath("vibrant-them-mon.png") });
  });
});
