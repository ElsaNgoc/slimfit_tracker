import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/weight-logs", () => ({ upsertWeightLog: vi.fn() }));

import { upsertWeightLog } from "@/actions/weight-logs";
import { WeightChart } from "@/components/profile/WeightChart";
import { CurrentThemeName, ThemeSwitcher } from "@/components/profile/ThemeSwitcher";
import { formatKgDelta, niceWeightTicks, pointsInRange } from "@/lib/weight";
import { DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, THEMES, applyTheme } from "@/lib/theme";

const upsert = vi.mocked(upsertWeightLog);
const TODAY = "2026-11-12";

// ---------- lib/weight ----------

describe("lib/weight", () => {
  it("niceWeightTicks: bước tròn, bao trọn dữ liệu + đệm; dữ liệu phẳng vẫn có trục", () => {
    expect(niceWeightTicks(60.2, 64.8)).toEqual([58, 60, 62, 64, 66]);
    expect(niceWeightTicks(62, 62)).toEqual([61.5, 62, 62.5]);
    const wide = niceWeightTicks(55, 80);
    expect(wide[0]).toBeLessThanOrEqual(55);
    expect(wide.at(-1)).toBeGreaterThanOrEqual(80);
    expect(wide.length).toBeLessThanOrEqual(6);
  });

  it("pointsInRange lọc theo số ngày gần nhất; formatKgDelta có dấu", () => {
    const pts = [
      { date: "2026-08-01", weightKg: 66 },
      { date: "2026-10-20", weightKg: 64 },
      { date: "2026-11-12", weightKg: 62.4 },
    ];
    expect(pointsInRange(pts, TODAY, 30).map((p) => p.date)).toEqual(["2026-10-20", "2026-11-12"]);
    expect(pointsInRange(pts, TODAY, null)).toHaveLength(3);
    expect(formatKgDelta(-1.64)).toBe("−1,6");
    expect(formatKgDelta(0.8)).toBe("+0,8");
    expect(formatKgDelta(0.02)).toBe("0");
  });
});

// ---------- WeightChart ----------

const LOGS = [
  { date: "2026-08-01", weightKg: 66 }, // 103 ngày trước → ngoài "3 tháng"
  { date: "2026-10-01", weightKg: 64 }, // 42 ngày trước → trong "3 tháng", ngoài "1 tháng"
  { date: "2026-11-05", weightKg: 63.1 },
  { date: "2026-11-12", weightKg: 62.4 },
];

describe("WeightChart", () => {
  beforeEach(() => {
    upsert.mockResolvedValue({ ok: true, data: { date: TODAY, weightKg: 62 } });
  });

  it("chưa có dữ liệu → yêu cầu nhập cân nặng ban đầu (điểm neo), điền sẵn cân nặng hồ sơ, lưu đúng ngày hôm nay", async () => {
    const user = userEvent.setup();
    render(<WeightChart logs={[]} today={TODAY} targetWeightKg={null} profileWeightKg={64.5} />);
    expect(screen.getByText(/Chưa có dữ liệu cân nặng/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cập nhật cân nặng hôm nay/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Biểu đồ cân nặng" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nhập cân nặng ban đầu" }));
    const dialog = screen.getByRole("dialog", { name: "Cân nặng ban đầu" });
    expect(within(dialog).getByLabelText("Cân nặng (kg)")).toHaveValue("64,5");
    expect(within(dialog).getByLabelText("Ngày cân")).toHaveValue(TODAY);
    expect(within(dialog).getByLabelText("Ngày cân")).toHaveAttribute("max", TODAY);
    await user.click(within(dialog).getByRole("button", { name: "Lưu & bắt đầu theo dõi" }));

    expect(upsert).toHaveBeenCalledWith({ date: TODAY, weightKg: 64.5 });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("có dữ liệu → số hiện tại, thay đổi so với điểm neo, khoảng cách tới mục tiêu, đường + mục tiêu trên biểu đồ", () => {
    render(<WeightChart logs={LOGS} today={TODAY} targetWeightKg={55} profileWeightKg={62.4} />);
    expect(screen.getByTestId("weight-current")).toHaveTextContent("62,4");
    expect(screen.getByTestId("weight-change")).toHaveTextContent("−3,6 kg từ 66 kg (01/08)");
    expect(screen.getByText("Còn 7,4 kg tới mục tiêu 55 kg")).toBeInTheDocument();
    expect(screen.getByTestId("weight-line")).toBeInTheDocument();
    expect(screen.getByTestId("weight-target-line")).toHaveTextContent("Mục tiêu 55 kg");
    expect(screen.getByRole("button", { name: "Sửa cân nặng hôm nay" })).toBeInTheDocument(); // hôm nay đã có số
  });

  it("lọc khoảng thời gian: mặc định 3 tháng (bỏ điểm 01/08), 'Tất cả' hiện đủ, '1 tháng' chỉ 2 điểm", async () => {
    const user = userEvent.setup();
    render(<WeightChart logs={LOGS} today={TODAY} targetWeightKg={null} profileWeightKg={null} />);
    expect(screen.getByRole("button", { name: "3 tháng" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("weight-dot")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(screen.getAllByTestId("weight-dot")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "1 tháng" }));
    expect(screen.getAllByTestId("weight-dot")).toHaveLength(2);
  });

  it("bàn phím: → / End hiện tooltip từng lần cân (giá trị + ngày); Esc ẩn", async () => {
    const user = userEvent.setup();
    render(<WeightChart logs={LOGS} today={TODAY} targetWeightKg={null} profileWeightKg={null} />);
    const chart = screen.getByRole("group", { name: "Biểu đồ cân nặng" });
    chart.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("weight-tooltip")).toHaveTextContent("64 kg01/10");
    await user.keyboard("{End}");
    expect(screen.getByTestId("weight-tooltip")).toHaveTextContent("62,4 kg12/11");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("weight-tooltip")).not.toBeInTheDocument();
  });

  it("Xem dạng bảng: mới nhất trước, có cột thay đổi so với lần trước", async () => {
    const user = userEvent.setup();
    render(<WeightChart logs={LOGS} today={TODAY} targetWeightKg={null} profileWeightKg={null} />);
    await user.click(screen.getByRole("button", { name: "Tất cả" }));
    await user.click(screen.getByRole("button", { name: "Xem dạng bảng" }));
    const rows = within(screen.getByRole("table", { name: "Lịch sử cân nặng" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "12/1162,4 kg−0,7 kg",
      "05/1163,1 kg−0,9 kg",
      "01/1064 kg−2 kg",
      "01/0866 kg—",
    ]);
  });

  it("1 điểm (chỉ có điểm neo) → chấm đơn + gợi ý cập nhật thêm, không vẽ đường", () => {
    render(<WeightChart logs={[LOGS[3]]} today={TODAY} targetWeightKg={null} profileWeightKg={null} />);
    expect(screen.getAllByTestId("weight-dot")).toHaveLength(1);
    expect(screen.queryByTestId("weight-line")).not.toBeInTheDocument();
    expect(screen.getByText(/để thấy đường xu hướng/)).toBeInTheDocument();
  });

  it("modal cập nhật: báo ngày đã có số, chặn kg sai / ngày tương lai, hiện lỗi server", async () => {
    upsert.mockResolvedValueOnce({ ok: false, error: "Bạn cần đăng nhập." });
    const user = userEvent.setup();
    render(<WeightChart logs={LOGS} today={TODAY} targetWeightKg={null} profileWeightKg={null} />);
    await user.click(screen.getByRole("button", { name: "Sửa cân nặng hôm nay" }));
    const dialog = screen.getByRole("dialog", { name: "Cập nhật cân nặng" });
    expect(within(dialog).getByText("Ngày 12/11 đã có 62,4 kg — lưu sẽ cập nhật số này.")).toBeInTheDocument();

    const kg = within(dialog).getByLabelText("Cân nặng (kg)");
    const save = within(dialog).getByRole("button", { name: "Lưu cân nặng" });
    await user.clear(kg);
    await user.type(kg, "12");
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Nhập cân nặng từ 25 đến 350 kg.");

    await user.clear(kg);
    await user.type(kg, "61,8");
    const date = within(dialog).getByLabelText("Ngày cân");
    await user.clear(date);
    await user.type(date, "2026-11-20");
    await user.click(save);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Không thể nhập cân nặng cho ngày trong tương lai.");
    expect(upsert).not.toHaveBeenCalled();

    await user.clear(date);
    await user.type(date, "2026-11-11");
    await user.click(save);
    expect(upsert).toHaveBeenCalledWith({ date: "2026-11-11", weightKg: 61.8 });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Bạn cần đăng nhập.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ---------- Theme ----------

describe("Theme switcher", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });

  it("script trong <head>: áp theme đã lưu + màu thanh trạng thái; giá trị lạ / chưa lưu → theme mặc định", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);

    localStorage.setItem(THEME_STORAGE_KEY, "cool");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("cool");
    expect(meta.content).toBe("#1e3842");

    localStorage.setItem(THEME_STORAGE_KEY, "hacker");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);

    localStorage.clear();
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
  });

  it("3 ô màu dạng radio; bấm → đổi data-theme trên <html>, lưu localStorage, tên ở menu đổi theo", async () => {
    document.documentElement.dataset.theme = "warm";
    const user = userEvent.setup();
    render(
      <>
        <ThemeSwitcher />
        <CurrentThemeName />
      </>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(THEMES.map((t) => `${t.label} — ${t.hint}`));
    expect(screen.getByRole("radio", { name: /^Lửa/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("current-theme")).toHaveTextContent("Lửa");

    await user.click(screen.getByRole("radio", { name: /^Biển/ }));
    expect(document.documentElement.dataset.theme).toBe("cool");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("cool");
    expect(screen.getByRole("radio", { name: /^Biển/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Lửa/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("current-theme")).toHaveTextContent("Biển");

    // ← → di chuyển trong radio group (vòng tròn)
    await user.keyboard("{ArrowRight}");
    expect(document.documentElement.dataset.theme).toBe("vibrant");
    expect(screen.getByRole("radio", { name: /^Neon/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(document.documentElement.dataset.theme).toBe("warm");
  });

  it("đổi mượt: bật class theme-transition rồi tự gỡ; tab khác đổi theme (sự kiện storage) → cập nhật theo", async () => {
    vi.useFakeTimers();
    try {
      render(<CurrentThemeName />);
      act(() => applyTheme("vibrant"));
      expect(document.documentElement.classList.contains("theme-transition")).toBe(true);
      act(() => vi.advanceTimersByTime(400));
      expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
      expect(screen.getByTestId("current-theme")).toHaveTextContent("Neon");

      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "cool" }));
      });
      expect(document.documentElement.dataset.theme).toBe("cool");
      expect(screen.getByTestId("current-theme")).toHaveTextContent("Biển");
    } finally {
      vi.useRealTimers();
    }
  });
});
