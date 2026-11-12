import { test, expect, type Page } from "@playwright/test";
import { DB_BRANCH, NEED_BRANCH_MSG } from "./helpers/constants";
import { branchSql } from "./helpers/db";

/**
 * Async Server Components (đọc auth + DB trong <Suspense>) — Vitest không render được,
 * ở đây kiểm tra HTML thật server trả về + UI sau khi stream xong.
 */
test.skip(!DB_BRANCH, NEED_BRANCH_MSG);

test("Dashboard `/` render dữ liệu người dùng đã đăng nhập", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1, name: "Tổng quan hôm nay" })).toBeVisible();
  // Ngày hiển thị theo giờ VN, vd "thứ tư, 11/11"
  await expect(page.locator("header p").first()).toHaveText(/\d{1,2}\/\d{1,2}/);

  // Dinh dưỡng: 4 vòng macro + 4 thẻ bữa ăn; bài tập hôm nay; thói quen
  for (const title of ["Dinh dưỡng hôm nay", "Bữa ăn hôm nay", "Gợi ý bài tập hôm nay", "Thói quen hôm nay"]) {
    await expect(page.getByRole("region", { name: title })).toBeVisible();
  }
  // Biểu đồ cân nặng đã chuyển sang tab Hồ sơ
  await expect(page.getByRole("region", { name: /Biểu đồ cân nặng|Cân nặng/ })).toHaveCount(0);
  for (const ring of ["Calories", "Protein", "Carbs", "Fat"]) {
    await expect(page.getByRole("progressbar", { name: ring })).toBeVisible();
  }
  for (const meal of ["Sáng", "Trưa", "Tối", "Phụ"]) {
    await expect(page.getByRole("button", { name: `Thêm món vào bữa ${meal}` })).toBeVisible();
  }
  // Ô nhập "Tổng lượng Calo" cũ đã bị bỏ
  await expect(page.getByText("Tổng lượng Calo nạp vào hôm nay")).toHaveCount(0);
  // Hồ sơ đã tách sang /profile
  await expect(page.getByRole("heading", { name: "Hồ sơ cơ thể" })).toHaveCount(0);
  // Không còn landing của khách
  await expect(page.getByRole("button", { name: "Bắt đầu miễn phí" })).toHaveCount(0);
});

test("`/profile` render TDEE + cân nặng + form hồ sơ + menu; 3 mục menu mở được trang con", async ({ page }) => {
  const res = await page.goto("/profile");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/profile$/);

  await expect(page.getByRole("heading", { level: 1, name: "Hồ sơ" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cân nặng" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Hồ sơ cơ thể" })).toBeVisible();

  const menu = page.getByRole("navigation", { name: "Cài đặt & tiện ích" });
  const pages = [
    ["Từ điển món ăn của tôi", /\/profile\/foods$/, "Từ điển món ăn của tôi"],
    ["Hướng dẫn sử dụng", /\/profile\/guide$/, "Hướng dẫn sử dụng"],
    ["Cài đặt giao diện", /\/profile\/appearance$/, "Cài đặt giao diện"],
  ] as const;
  for (const [link, url, heading] of pages) {
    await menu.getByRole("link", { name: new RegExp(link) }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    // Tab Hồ sơ vẫn được đánh dấu ở trang con
    const nav = page.getByRole("navigation", { name: "Điều hướng chính" }).filter({ visible: true });
    await expect(nav.getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Hồ sơ", exact: false }).filter({ hasText: "‹" }).click();
    await expect(page).toHaveURL(/\/profile$/);
  }
});

test("thanh tab đáy (mobile) điều hướng giữa 3 tab và đánh dấu tab đang mở", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Điều hướng chính" }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Tổng quan" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Tập luyện" }).click();
  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ghi chép tập luyện" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Tập luyện" })).toHaveAttribute("aria-current", "page");

  // Tự động lưu: không còn thanh Save Workout cố định ở đáy
  await expect(page.getByRole("button", { name: /Save Workout|Cập nhật ·/ })).toHaveCount(0);
  await expect(page.getByTestId("autosave-status")).toHaveText(/Mọi thay đổi được lưu tự động/);

  await nav.getByRole("link", { name: "Hồ sơ" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 2, name: "Hồ sơ cơ thể" })).toBeVisible();
});

test("`/workouts` render danh sách bài gym từ DB + thư viện video giãn cơ", async ({ page }) => {
  const res = await page.goto("/workouts");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/workouts$/); // không bị redirect sang sign-in

  await expect(page.getByRole("heading", { level: 1, name: "Ghi chép tập luyện" })).toBeVisible();

  const select = page.getByLabel("Thêm bài tập");
  await expect(select).toBeVisible();
  // 41 bài gym seed (35 bài chính + 6 bài đốt mỡ mới) + option placeholder; bài đốt mỡ nằm trong nhóm riêng
  await expect(select.locator("option")).toHaveCount(42);
  await expect(select.locator('optgroup[label="🔥 Đốt mỡ cuối buổi"] option')).toHaveCount(8);
  // 2 khu vực
  await expect(page.getByRole("heading", { level: 2, name: "Bài tập chính" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Đốt mỡ cuối buổi (10-15 Phút)" })).toBeVisible();

  // Ngày mặc định = hôm nay theo giờ VN (server tính)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  await expect(page.getByLabel("Ngày tập")).toHaveValue(today);

  // Thư viện video thay cho lưới ảnh tĩnh yoga cũ
  const library = page.getByRole("region", { name: "Yoga & Giãn cơ" });
  await expect(library.getByRole("button", { name: /^Xem video:/ })).toHaveCount(5);
  await expect(page.getByText("Chạm vào tư thế để xem hướng dẫn chuẩn form.")).toHaveCount(0);
});

test("Video giãn cơ: bấm card → modal phát YouTube embed; Esc đóng và gỡ iframe", async ({ page }) => {
  await page.goto("/workouts#yoga-videos");
  const library = page.getByRole("region", { name: "Yoga & Giãn cơ" });
  await expect(library).toBeInViewport();

  const card = library.getByRole("button", { name: /^Xem video: Yoga for Neck and Shoulder Relief/ });
  // Thumbnail tải được thật từ YouTube
  const thumb = card.locator("img");
  await expect(thumb).toHaveAttribute("src", "https://i.ytimg.com/vi/SedzswEwpPw/mqdefault.jpg");
  await expect.poll(() => thumb.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);

  await card.click();
  const dialog = page.getByRole("dialog", { name: "Yoga for Neck and Shoulder Relief" });
  await expect(dialog).toBeVisible();
  const iframe = dialog.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/SedzswEwpPw\?/);
  // Khung 16:9 vừa màn hình điện thoại
  const box = (await iframe.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("iframe")).toHaveCount(0);
});

// Thứ của hôm nay theo giờ VN (0 = CN), giống weekdayOf(todayInAppTz()) trong app.
const todayIndex = () =>
  new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()) + "T00:00:00Z").getUTCDay();
const dayLabel = (day: number) => (day === 0 ? "Chủ nhật" : `Thứ ${day + 1}`);
const DEFAULT_SCHEDULE = ["rest", "lower-1", "upper-a", "active-rest", "lower-2", "upper-b", "rest"];

async function currentUserId(page: Page): Promise<string> {
  await page.waitForFunction(() => window.Clerk?.user?.id);
  return page.evaluate(() => window.Clerk.user!.id);
}

// Các test dưới cùng đọc / ghi users.weekly_schedule của user E2E → chạy tuần tự, test đổi lịch chạy sau cùng.
test.describe.serial("Lịch tuần (users.weekly_schedule)", () => {
test("Gợi ý hôm nay theo thứ (giờ VN) + lịch tuần + Swap bài tập", async ({ page }) => {
  await page.goto("/workouts");

  // Thứ của hôm nay theo giờ VN — khối gợi ý phải khớp
  const day = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()) + "T00:00:00Z",
  ).getUTCDay();
  const label = day === 0 ? "Chủ nhật" : `Thứ ${day + 1}`;
  await expect(
    page.getByRole("heading", { name: `Gợi ý bài tập cho hôm nay (${label})` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Thêm nhanh/ })).toHaveCount(0);

  // Mở lịch tuần → chọn buổi Thứ 2 (không phụ thuộc hôm nay là thứ mấy)
  await page.getByRole("button", { name: /Xem lịch cả tuần/ }).click();
  const dialog = page.getByRole("dialog", { name: "Lịch tập cả tuần" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(7);
  await dialog.getByRole("button", { name: "Tập buổi Lower Body 1 (Thứ 2)" }).click();
  await expect(dialog).toBeHidden();

  // Lower Body 1: 3 bài chính (nhập kg × rep) + chuỗi 4 bài đốt mỡ (checkbox)
  const mains = page.locator('section[data-phase="main"]');
  await expect(mains).toHaveCount(3);
  await expect(page.getByText("Tạ gợi ý:")).toHaveCount(3);
  await expect(page.getByText("20–30 kg (thanh đòn)").first()).toBeVisible();
  await expect(page.getByTestId("finisher-row")).toHaveCount(4);
  for (const label of ["Vung tạ ấm", "Plank", "Gập bụng", "Nâng hông"]) {
    await expect(page.getByRole("checkbox", { name: new RegExp(label) })).toBeVisible();
  }

  // Swap Hip Thrust → Cable Kickback (Glute Bridge là bài đốt mỡ → không được gợi ý cho bài chính)
  await page.getByRole("button", { name: "Thay thế Hip Thrust" }).click();
  await expect(page.getByRole("button", { name: "Đổi sang Glute Bridge" })).toHaveCount(0);
  await page.getByRole("button", { name: "Đổi sang Cable Kickback" }).click();
  await expect(mains.first()).toHaveAttribute("aria-label", "Cable Kickback");
  await expect(page.getByText("Đã thay Hip Thrust bằng Cable Kickback.")).toBeVisible();
});

test("Cài đặt lịch tuần → lưu DB → Tổng quan tự gợi ý theo lịch → 'Bắt đầu tập' nạp sẵn bài", async ({ page }) => {
  await page.goto("/workouts");
  const userId = await currentUserId(page);
  const day = todayIndex();
  const label = dayLabel(day);
  // Chọn 1 buổi gym khác lịch mặc định của hôm nay để chắc chắn thấy thay đổi
  const target = DEFAULT_SCHEDULE[day] === "lower-1" ? { id: "upper-a", name: "Upper Body A", first: "Lat Pulldown" } : { id: "lower-1", name: "Lower Body 1", first: "Hip Thrust" };

  try {
    // 1) Tab Tập luyện → Cài đặt lịch tuần → đổi hôm nay → Lưu
    await page.getByRole("button", { name: "⚙️ Cài đặt lịch tuần" }).click();
    const settings = page.getByRole("dialog", { name: "Cài đặt lịch tuần" });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("combobox")).toHaveCount(7);
    await expect(settings.getByRole("button", { name: "Chưa có thay đổi" })).toBeDisabled();
    await settings.getByLabel(label, { exact: true }).selectOption(target.id);
    await expect(settings.getByText("Đã đổi")).toHaveCount(1);
    await settings.getByRole("button", { name: "Lưu lịch tuần" }).click();
    await expect(settings).toBeHidden();
    await expect(page.getByText("Đã lưu lịch tuần.")).toBeVisible();

    const card = page.getByRole("region", { name: `Gợi ý bài tập cho hôm nay (${label})` });
    await expect(card.getByText(target.name, { exact: true })).toBeVisible();

    const expected = [...DEFAULT_SCHEDULE];
    expected[day] = target.id;
    const [row] = await branchSql()`SELECT weekly_schedule FROM users WHERE id = ${userId}`;
    expect(row.weekly_schedule).toEqual(expected);

    // 2) Tổng quan đọc lịch mới
    await page.goto("/");
    const widget = page.getByRole("region", { name: "Gợi ý bài tập hôm nay" });
    await expect(widget.getByText(label, { exact: true })).toBeVisible();
    await expect(widget.getByTestId("today-template")).toHaveText(target.name);
    await expect(widget.getByText(target.first)).toBeVisible();

    // 3) "Bắt đầu tập" → /workouts đã nạp sẵn đủ bài, URL sạch query
    await widget.getByRole("link", { name: "Bắt đầu tập" }).click();
    await expect(page).toHaveURL(/\/workouts$/);
    const mains = page.locator('section[data-phase="main"]');
    await expect(mains).toHaveCount(target.id === "lower-1" ? 3 : 4);
    await expect(page.getByTestId("finisher-row")).toHaveCount(4);
    await expect(page.getByRole("button", { name: `Xem hướng dẫn ${target.first}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "✓ Đã thêm vào buổi tập" })).toBeDisabled();
    await page.reload();
    await expect(mains).toHaveCount(0); // chưa tập hiệp nào → reload không nạp lại

    // 4) "Đổi lịch" ở Tổng quan → mở thẳng Cài đặt; đặt hôm nay là ngày nghỉ
    await page.goto("/");
    await page.getByRole("link", { name: /Đổi lịch/ }).click();
    const settings2 = page.getByRole("dialog", { name: "Cài đặt lịch tuần" });
    await expect(settings2).toBeVisible();
    await expect(settings2.getByLabel(label, { exact: true })).toHaveValue(target.id);
    await settings2.getByLabel(label, { exact: true }).selectOption("rest");
    await settings2.getByRole("button", { name: "Lưu lịch tuần" }).click();
    await expect(settings2).toBeHidden();

    await page.goto("/");
    await expect(widget.getByTestId("today-template")).toHaveText("Nghỉ ngơi");
    await expect(widget.getByText(/Hôm nay là ngày nghỉ/)).toBeVisible();
    await expect(widget.getByRole("link", { name: "Bắt đầu tập" })).toHaveCount(0);
  } finally {
    await branchSql()`UPDATE users SET weekly_schedule = NULL WHERE id = ${userId}`;
  }
});
});

for (const { name, src, credit } of [
  { name: "Barbell Squat", src: "/exercises/steps/barbell-squat.png", credit: /Everkinetic · CC BY-SA 4\.0/ },
  { name: "Bulgarian Split Squat", src: /wger\.de\/media\/exercise-images\//, credit: /wger\.de/ },
]) {
  test(`Modal hướng dẫn ${name} hiển thị ảnh tĩnh, không có điều khiển ảnh động`, async ({ page }, testInfo) => {
    await page.goto("/workouts");
    await page.getByLabel("Thêm bài tập").selectOption({ label: name });
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await page.getByRole("button", { name: `Xem hướng dẫn ${name}` }).click();

    const dialog = page.getByRole("dialog", { name });
    const img = dialog.getByRole("img", { name: `Minh hoạ tư thế ${name}` });
    await expect(img).toHaveAttribute("src", src);
    // Ảnh tải thật (không rơi vào fallback)
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(img).toHaveCSS("opacity", "1");
    await expect(dialog.getByText(credit)).toBeVisible();

    // Chỉ ảnh tĩnh: không badge "Ảnh động", không nút tạm dừng, không video/canvas
    await expect(dialog.getByText(/Ảnh động|Đã tạm dừng/)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /ảnh động/i })).toHaveCount(0);
    await expect(dialog.locator("video, canvas")).toHaveCount(0);

    // Khung 4:3 trên mobile, nằm gọn trong màn hình
    const frame = dialog.locator("figure > div");
    const box = (await frame.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(4 / 3, 1);
    expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    // Ảnh tĩnh: 2 lần chụp cách nhau 1 giây giống hệt nhau
    const shot1 = await frame.screenshot();
    await page.waitForTimeout(1000);
    expect(shot1.equals(await frame.screenshot())).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`modal-${name}.png`) });
  });
}

test("Ảnh ghép 2 tư thế đủ nét cho màn hình mobile (≥ 1 pixel ảnh / pixel thiết bị)", async ({ page }) => {
  await page.goto("/workouts");
  await page.getByLabel("Thêm bài tập").selectOption({ label: "Barbell Squat" });
  await page.getByRole("button", { name: "Thêm", exact: true }).click();
  await page.getByRole("button", { name: "Xem hướng dẫn Barbell Squat" }).click();
  const img = page.getByRole("img", { name: "Minh hoạ tư thế Barbell Squat" });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1200);
  const { cssWidth, dpr } = await img.evaluate((el) => ({ cssWidth: el.clientWidth, dpr: devicePixelRatio }));
  expect(1200).toBeGreaterThanOrEqual(cssWidth * dpr);
});

test("`/api/exercises` trả JSON cho user đã đăng nhập", async ({ page }) => {
  const res = await page.request.get("/api/exercises?category=yoga");
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { category: string }[] };
  expect(data).toHaveLength(9);
  expect(data.every((e) => e.category === "yoga")).toBe(true);
});
