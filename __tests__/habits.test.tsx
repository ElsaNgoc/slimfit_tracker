import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/actions/habits", () => ({
  createHabit: vi.fn(),
  deleteHabit: vi.fn(),
  setHabitCompleted: vi.fn(),
}));

import { createHabit, deleteHabit, setHabitCompleted } from "@/actions/habits";
import { BEAUTY_SUGGESTIONS, habitKey, normalizeHabitName, remainingSuggestions } from "@/lib/habits";
import { HabitTracker, type HabitItem } from "@/components/habits/HabitTracker";

const create = vi.mocked(createHabit);
const del = vi.mocked(deleteHabit);
const setDone = vi.mocked(setHabitCompleted);

const DATE = "2026-11-12";
let nextId = 100;

beforeEach(() => {
  create.mockImplementation(async ({ name }) => ({
    ok: true,
    data: { id: nextId++, userId: "u", name: normalizeHabitName(name), createdAt: new Date() },
  }));
  setDone.mockImplementation(async (input) => ({ ok: true, data: input }));
  del.mockImplementation(async (id) => ({ ok: true, data: { id } }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

// ---------- lib/habits ----------

describe("lib/habits", () => {
  it("chuẩn hoá tên + so trùng không phân biệt hoa thường", () => {
    expect(normalizeHabitName("  Đắp   mặt  nạ ")).toBe("Đắp mặt nạ");
    expect(habitKey("SKIN care")).toBe(habitKey(" skin  Care"));
  });

  it("gợi ý làm đẹp có đủ 3 ý tưởng yêu cầu và ẩn gợi ý đã thêm", () => {
    expect(BEAUTY_SUGGESTIONS).toEqual(expect.arrayContaining(["Giãn cơ 30 phút", "Chăm sóc tóc", "Uống 2L nước"]));
    const left = remainingSuggestions(["uống 2l NƯỚC", "Chăm sóc tóc"]);
    expect(left).not.toContain("Uống 2L nước");
    expect(left).not.toContain("Chăm sóc tóc");
    expect(left).toContain("Giãn cơ 30 phút");
  });
});

// ---------- HabitTracker ----------

const HABITS: HabitItem[] = [
  { id: 1, name: "Skin care", completed: true },
  { id: 2, name: "Lịch peel da HA", completed: false },
  { id: 3, name: "Đắp mặt nạ", completed: false },
];

const box = (name: string) => screen.getByRole("checkbox", { name });

describe("HabitTracker", () => {
  it("hiển thị thói quen dạng checkbox với trạng thái của ngày + đếm số đã xong", () => {
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);
    expect(box("Skin care")).toBeChecked();
    expect(box("Lịch peel da HA")).not.toBeChecked();
    expect(box("Đắp mặt nạ")).not.toBeChecked();
    expect(screen.getByText(/Đã xong/)).toHaveTextContent("Đã xong 1 / 3");
  });

  it("chưa có thói quen → hướng dẫn thêm", () => {
    render(<HabitTracker date={DATE} initialHabits={[]} />);
    expect(screen.getByText(/Chưa có thói quen nào/)).toBeInTheDocument();
  });

  it("tick → lưu ngay cho đúng ngày, bộ đếm tăng", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    await user.click(box("Lịch peel da HA"));

    expect(box("Lịch peel da HA")).toBeChecked();
    expect(setDone).toHaveBeenCalledWith({ habitId: 2, date: DATE, completed: true });
    expect(screen.getByText(/Đã xong/)).toHaveTextContent("Đã xong 2 / 3");
    await waitFor(() => expect(box("Lịch peel da HA")).toBeEnabled());
  });

  it("bỏ tick lưu completed = false; server lỗi → hoàn tác + báo lỗi", async () => {
    setDone.mockResolvedValueOnce({ ok: false, error: "Đã có lỗi xảy ra, vui lòng thử lại." });
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    await user.click(box("Skin care"));

    expect(setDone).toHaveBeenCalledWith({ habitId: 1, date: DATE, completed: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lỗi xảy ra");
    expect(box("Skin care")).toBeChecked();
  });

  it("gõ tên + 'Thêm thói quen' → thói quen mới (chưa check) xuất hiện, ô nhập được xoá", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    const input = screen.getByLabelText("Tên thói quen mới");
    await user.type(input, "  Uống   collagen ");
    await user.click(screen.getByRole("button", { name: "Thêm thói quen" }));

    expect(create).toHaveBeenCalledWith({ name: "Uống collagen" });
    expect(await screen.findByRole("checkbox", { name: "Uống collagen" })).not.toBeChecked();
    expect(input).toHaveValue("");
    expect(screen.getByText(/Đã xong/)).toHaveTextContent("Đã xong 1 / 4");
  });

  it("Enter trong ô nhập cũng thêm được", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={[]} />);
    await user.type(screen.getByLabelText("Tên thói quen mới"), "Tập thở{Enter}");
    expect(await screen.findByRole("checkbox", { name: "Tập thở" })).toBeInTheDocument();
  });

  it("rỗng / trùng tên (không phân biệt hoa thường) → báo lỗi, không gọi server", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    await user.click(screen.getByRole("button", { name: "Thêm thói quen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Nhập tên thói quen.");

    await user.type(screen.getByLabelText("Tên thói quen mới"), "SKIN CARE");
    await user.click(screen.getByRole("button", { name: "Thêm thói quen" }));
    expect(screen.getByRole("alert")).toHaveTextContent('Đã có thói quen "SKIN CARE".');
    expect(create).not.toHaveBeenCalled();
  });

  it("server từ chối (vd. trùng do tab khác vừa thêm) → hiện lỗi của server, giữ nội dung ô nhập", async () => {
    create.mockResolvedValueOnce({ ok: false, error: 'Đã có thói quen "Tập thở".' });
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={[]} />);
    await user.type(screen.getByLabelText("Tên thói quen mới"), "Tập thở");
    await user.click(screen.getByRole("button", { name: "Thêm thói quen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Đã có thói quen "Tập thở".');
    expect(screen.getByLabelText("Tên thói quen mới")).toHaveValue("Tập thở");
  });

  it("'Gợi ý làm đẹp' xổ ra ý tưởng; bấm để thêm nhanh, gợi ý đã thêm biến mất", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    const toggle = screen.getByRole("button", { name: /Gợi ý làm đẹp/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Thêm nhanh Uống 2L nước" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Gợi ý làm đẹp" });
    for (const s of ["Giãn cơ 30 phút", "Chăm sóc tóc", "Uống 2L nước"]) {
      expect(within(list).getByRole("button", { name: `Thêm nhanh ${s}` })).toBeInTheDocument();
    }
    // "Đắp mặt nạ" đã có trong danh sách → không gợi ý lại
    expect(within(list).queryByRole("button", { name: "Thêm nhanh Đắp mặt nạ" })).not.toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: "Thêm nhanh Uống 2L nước" }));
    expect(create).toHaveBeenCalledWith({ name: "Uống 2L nước" });
    expect(await screen.findByRole("checkbox", { name: "Uống 2L nước" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm nhanh Uống 2L nước" })).not.toBeInTheDocument();
  });

  it("xoá: hỏi xác nhận; huỷ → giữ nguyên; đồng ý → xoá; server lỗi → trả về đúng vị trí", async () => {
    const user = userEvent.setup();
    render(<HabitTracker date={DATE} initialHabits={HABITS} />);

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Xoá thói quen Lịch peel da HA" }));
    expect(del).not.toHaveBeenCalled();
    expect(box("Lịch peel da HA")).toBeInTheDocument();

    del.mockResolvedValueOnce({ ok: false, error: "Không tìm thấy thói quen." });
    await user.click(screen.getByRole("button", { name: "Xoá thói quen Lịch peel da HA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy thói quen.");
    // Hoàn tác trả thói quen về đúng vị trí cũ (giữa danh sách)
    const names = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent!.replace("✓", ""));
    expect(names).toEqual(["Skin care", "Lịch peel da HA", "Đắp mặt nạ"]);

    await user.click(screen.getByRole("button", { name: "Xoá thói quen Lịch peel da HA" }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Lịch peel da HA" })).not.toBeInTheDocument());
    expect(del).toHaveBeenLastCalledWith(2);
    expect(screen.getByText(/Đã xong/)).toHaveTextContent("Đã xong 1 / 2");
  });
});

// ---------- Reset sang ngày mới ----------

describe("HabitTracker — sang ngày mới", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("để trang mở qua nửa đêm (giờ VN) → tự làm mới để lấy trạng thái ngày mới", () => {
    vi.useFakeTimers();
    // 23:59 ngày 12/11 giờ VN = 16:59 UTC
    vi.setSystemTime(new Date("2026-11-12T16:59:00Z"));
    render(<HabitTracker date="2026-11-12" initialHabits={HABITS} />);

    act(() => vi.advanceTimersByTime(30_000));
    expect(router.refresh).not.toHaveBeenCalled();

    // Qua 00:00 ngày 13/11 giờ VN
    vi.setSystemTime(new Date("2026-11-12T17:00:30Z"));
    act(() => vi.advanceTimersByTime(60_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("quay lại tab sáng hôm sau → làm mới ngay khi tab hiện lại", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T01:00:00Z")); // 08:00 ngày 13/11 giờ VN
    render(<HabitTracker date="2026-11-12" initialHabits={HABITS} />);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("dữ liệu ngày mới (key đổi) → checkbox về trạng thái từ server, không giữ tick của hôm qua", () => {
    const { rerender } = render(<HabitTracker key="2026-11-12" date="2026-11-12" initialHabits={HABITS} />);
    expect(box("Skin care")).toBeChecked();

    const nextDay = HABITS.map((h) => ({ ...h, completed: false })); // chưa có habit_logs cho ngày mới
    rerender(<HabitTracker key="2026-11-13" date="2026-11-13" initialHabits={nextDay} />);
    expect(screen.getAllByRole("checkbox").every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/Đã xong/)).toHaveTextContent("Đã xong 0 / 3");
  });
});
