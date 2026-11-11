import { test, expect } from "@playwright/test";
import { DB_BRANCH, NEED_BRANCH_MSG } from "./helpers/constants";

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

  // Các thẻ client nhận props từ server
  await expect(page.getByLabel("Tổng lượng Calo nạp vào hôm nay")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Đã tập Yoga giãn cơ/ })).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: "Hồ sơ cơ thể" })).toBeVisible();
  // Không còn landing của khách
  await expect(page.getByRole("button", { name: "Bắt đầu miễn phí" })).toHaveCount(0);
});

test("`/workouts` render danh sách bài gym + thư viện yoga từ DB", async ({ page }) => {
  const res = await page.goto("/workouts");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/workouts$/); // không bị redirect sang sign-in

  await expect(page.getByRole("heading", { level: 1, name: "Ghi chép tập luyện" })).toBeVisible();

  const select = page.getByLabel("Thêm bài tập gym");
  await expect(select).toBeVisible();
  // 35 bài gym seed + option placeholder
  await expect(select.locator("option")).toHaveCount(36);
  await expect(select.locator("optgroup").first()).toBeAttached();

  // Ngày mặc định = hôm nay theo giờ VN (server tính)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  await expect(page.getByLabel("Ngày tập")).toHaveValue(today);
});

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

  const cards = page.getByRole("button", { name: /^Xem hướng dẫn / });
  await expect(cards).toHaveCount(5);
  await expect(page.getByText("Tạ gợi ý:")).toHaveCount(5);
  await expect(page.getByText("20–30 kg (thanh đòn)").first()).toBeVisible();

  // Swap Hip Thrust → Glute Bridge (Cable Kickback đã có trong buổi nên không được gợi ý)
  await page.getByRole("button", { name: "Thay thế Hip Thrust" }).click();
  await expect(page.getByRole("button", { name: "Đổi sang Cable Kickback" })).toHaveCount(0);
  await page.getByRole("button", { name: "Đổi sang Glute Bridge" }).click();
  await expect(cards.first()).toHaveAccessibleName("Xem hướng dẫn Glute Bridge");
  await expect(page.getByRole("button", { name: "Xem hướng dẫn Hip Thrust" })).toHaveCount(0);
  await expect(page.getByText("Đã thay Hip Thrust bằng Glute Bridge.")).toBeVisible();
});

for (const { name, src, credit } of [
  { name: "Barbell Squat", src: "/exercises/steps/barbell-squat.png", credit: /Everkinetic · CC BY-SA 4\.0/ },
  { name: "Bulgarian Split Squat", src: /wger\.de\/media\/exercise-images\//, credit: /wger\.de/ },
]) {
  test(`Modal hướng dẫn ${name} hiển thị ảnh tĩnh, không có điều khiển ảnh động`, async ({ page }, testInfo) => {
    await page.goto("/workouts");
    await page.getByLabel("Thêm bài tập gym").selectOption({ label: name });
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
  await page.getByLabel("Thêm bài tập gym").selectOption({ label: "Barbell Squat" });
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
