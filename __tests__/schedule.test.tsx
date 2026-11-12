import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/schedule", () => ({ updateWeeklySchedule: vi.fn() }));
vi.mock("@/actions/workout-logs", () => ({
  addWorkoutSet: vi.fn(),
  updateWorkoutSet: vi.fn(),
  deleteWorkoutSet: vi.fn(),
  changeWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  saveWorkoutNotes: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { updateWeeklySchedule } from "@/actions/schedule";
import { WorkoutLogger, type GymExercise } from "@/components/WorkoutLogger";
import { ScheduleSettingsModal } from "@/components/workout/ScheduleSettingsModal";
import { TodayWorkoutWidget } from "@/components/dashboard/TodayWorkoutWidget";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  TEMPLATE_BY_ID,
  WORKOUT_TEMPLATES,
  sameSchedule,
  summarizeSchedule,
  weeklyScheduleSchema,
} from "@/lib/workout-templates";

const save = vi.mocked(updateWeeklySchedule);

// Ngày tham chiếu (giờ VN): 2026-11-12 là Thứ 5 → index getDay() = 4; 2026-11-10 là Thứ 3 → 2.
const THU = "2026-11-12";
const TUE = "2026-11-10";

beforeEach(() => {
  save.mockImplementation(async (schedule) => ({ ok: true, data: schedule }));
});

// ---------- lib ----------

describe("lib/workout-templates — lịch tuần", () => {
  it("validate: đúng 7 ngày, chỉ template id có thật", () => {
    expect(weeklyScheduleSchema.safeParse(DEFAULT_WEEKLY_SCHEDULE).success).toBe(true);
    expect(weeklyScheduleSchema.safeParse(DEFAULT_WEEKLY_SCHEDULE.slice(0, 6)).success).toBe(false);
    expect(weeklyScheduleSchema.safeParse([...DEFAULT_WEEKLY_SCHEDULE.slice(0, 6), "leg-day"]).success).toBe(false);
  });

  it("tóm tắt số buổi + so sánh lịch", () => {
    expect(summarizeSchedule(DEFAULT_WEEKLY_SCHEDULE)).toEqual({ gym: 4, yoga: 1, rest: 2 });
    expect(sameSchedule(DEFAULT_WEEKLY_SCHEDULE, [...DEFAULT_WEEKLY_SCHEDULE])).toBe(true);
    expect(sameSchedule(DEFAULT_WEEKLY_SCHEDULE, ["rest", ...DEFAULT_WEEKLY_SCHEDULE.slice(1, 6), "upper-a"])).toBe(false);
  });
});

// ---------- ScheduleSettingsModal ----------

describe("ScheduleSettingsModal", () => {
  const setup = (onSaved = vi.fn()) => {
    const user = userEvent.setup();
    render(
      <ScheduleSettingsModal open schedule={DEFAULT_WEEKLY_SCHEDULE} today={4} onClose={vi.fn()} onSaved={onSaved} />,
    );
    return { user, onSaved, dialog: screen.getByRole("dialog", { name: "Cài đặt lịch tuần" }) };
  };

  it("7 ô chọn theo thứ tự Thứ 2 → Chủ nhật, giá trị theo lịch đã lưu, đánh dấu hôm nay", () => {
    const { dialog } = setup();
    const selects = within(dialog).getAllByRole("combobox");
    expect(selects.map((s) => s.getAttribute("id") && (s as HTMLSelectElement).labels![0].textContent)).toEqual([
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ]);
    expect(within(dialog).getByLabelText("Thứ 2")).toHaveValue("lower-1");
    expect(within(dialog).getByLabelText("Chủ nhật")).toHaveValue("rest");
    expect(within(dialog).getByText("Hôm nay")).toBeInTheDocument();
    // Mọi template đều có trong ô chọn
    expect(within(within(dialog).getByLabelText("Thứ 2")).getAllByRole("option")).toHaveLength(WORKOUT_TEMPLATES.length);
  });

  it("chưa đổi gì → nút lưu bị khoá", () => {
    const { dialog } = setup();
    expect(within(dialog).getByRole("button", { name: "Chưa có thay đổi" })).toBeDisabled();
  });

  it("T3 → Lower Body 1, T4 → Rest, T5 → Upper Body A: lưu đúng index getDay(), cập nhật tóm tắt", async () => {
    const { user, dialog, onSaved } = setup();

    await user.selectOptions(within(dialog).getByLabelText("Thứ 3"), "lower-1");
    await user.selectOptions(within(dialog).getByLabelText("Thứ 4"), "rest");
    await user.selectOptions(within(dialog).getByLabelText("Thứ 5"), "upper-a");
    expect(within(dialog).getAllByText("Đã đổi")).toHaveLength(3);
    expect(within(dialog).getByText(/buổi gym/)).toHaveTextContent("4 buổi gym · 0 yoga · 3 nghỉ");

    await user.click(within(dialog).getByRole("button", { name: "Lưu lịch tuần" }));

    // index: 0 CN · 1 T2 · 2 T3 · 3 T4 · 4 T5 · 5 T6 · 6 T7
    const expected = ["rest", "lower-1", "lower-1", "rest", "upper-a", "upper-b", "rest"];
    expect(save).toHaveBeenCalledWith(expected);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expected));
  });

  it("'Lịch mặc định' đưa bản nháp về mặc định", async () => {
    const user = userEvent.setup();
    const custom = ["upper-a", "upper-a", "upper-a", "upper-a", "upper-a", "upper-a", "upper-a"];
    render(<ScheduleSettingsModal open schedule={custom} today={4} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Lịch mặc định" }));
    expect(screen.getByLabelText("Thứ 2")).toHaveValue("lower-1");
    expect(screen.getByLabelText("Thứ 4")).toHaveValue("active-rest");
    expect(screen.getByRole("button", { name: "Lịch mặc định" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu lịch tuần" })).toBeEnabled();
  });

  it("server lỗi → giữ modal, hiện lỗi, không gọi onSaved", async () => {
    save.mockResolvedValueOnce({ ok: false, error: "Bạn cần đăng nhập." });
    const { user, dialog, onSaved } = setup();
    await user.selectOptions(within(dialog).getByLabelText("Thứ 6"), "rest");
    await user.click(within(dialog).getByRole("button", { name: "Lưu lịch tuần" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Bạn cần đăng nhập.");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// ---------- WorkoutLogger + lịch tuần ----------

const ex = (id: number, name: string): GymExercise => ({
  id,
  name,
  category: "gym",
  muscleGroup: "Mông",
  instruction: null,
  gifUrl: null,
  imageCredit: null,
});
const LOWER_2 = TEMPLATE_BY_ID.get("lower-2")!.exerciseNames.map((n, i) => ex(i + 1, n));
const UPPER_A = TEMPLATE_BY_ID.get("upper-a")!.exerciseNames.map((n, i) => ex(100 + i, n));
const ALL = [...LOWER_2, ...UPPER_A];

const exerciseCards = () => screen.queryAllByRole("button", { name: /^Thay thế / });

describe("WorkoutLogger — cài đặt lịch & tự nạp bài", () => {
  it("nút '⚙️ Cài đặt lịch tuần' mở modal; lưu xong đóng modal và báo đã cập nhật", async () => {
    const user = userEvent.setup();
    render(<WorkoutLogger exercises={ALL} today={THU} />);

    await user.click(screen.getByRole("button", { name: "⚙️ Cài đặt lịch tuần" }));
    const dialog = screen.getByRole("dialog", { name: "Cài đặt lịch tuần" });
    await user.selectOptions(within(dialog).getByLabelText("Thứ 5"), "upper-a");
    await user.click(within(dialog).getByRole("button", { name: "Lưu lịch tuần" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cài đặt lịch tuần" })).not.toBeInTheDocument());
    expect(screen.getByText("Đã lưu lịch tuần. Gợi ý đã cập nhật theo lịch mới.")).toHaveAttribute("role", "status");
  });

  it("'⚙️ Chỉnh lịch' trong modal Lịch cả tuần chuyển sang modal Cài đặt", async () => {
    const user = userEvent.setup();
    render(<WorkoutLogger exercises={ALL} today={THU} />);
    await user.click(screen.getByRole("button", { name: "📅 Xem lịch cả tuần" }));
    await user.click(screen.getByRole("button", { name: "⚙️ Chỉnh lịch" }));
    expect(screen.queryByRole("dialog", { name: "Lịch tập cả tuần" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Cài đặt lịch tuần" })).toBeInTheDocument();
  });

  it("gợi ý hôm nay đi theo lịch đã lưu (Thứ 5 = Upper Body A khi user tự đặt)", () => {
    const custom = [...DEFAULT_WEEKLY_SCHEDULE];
    custom[4] = "upper-a";
    render(<WorkoutLogger exercises={ALL} today={THU} schedule={custom} />);
    const card = screen.getByRole("region", { name: /Gợi ý bài tập cho hôm nay \(Thứ 5\)/ });
    expect(within(card).getByText("Upper Body A")).toBeInTheDocument();
    expect(within(card).getByText("Lat Pulldown")).toBeInTheDocument();
  });

  it("autoStart (?start=today) → nạp sẵn đủ bài của template hôm nay, xoá query khỏi URL", () => {
    window.history.replaceState(null, "", "/workouts?start=today");
    render(<WorkoutLogger exercises={ALL} today={THU} autoStart />);

    expect(exerciseCards()).toHaveLength(LOWER_2.length);
    for (const e of LOWER_2) expect(screen.getByRole("button", { name: `Thay thế ${e.name}` })).toBeInTheDocument();
    // Fixture chỉ có bài chính → 4 bài đốt mỡ của mẫu được báo là chưa có trong hệ thống
    expect(screen.getByText(/^Đã thêm \d+ bài từ Lower Body 2\./)).toHaveTextContent(`Đã thêm ${LOWER_2.length} bài từ Lower Body 2.`);
    expect(screen.getByRole("button", { name: "✓ Đã thêm vào buổi tập" })).toBeDisabled();
    expect(window.location.search).toBe("");
  });

  it("autoStart vào ngày nghỉ / yoga → không nạp bài gym nào", () => {
    const sat = "2026-11-14"; // Thứ 7 = Nghỉ ngơi trong lịch mặc định
    render(<WorkoutLogger exercises={ALL} today={sat} autoStart />);
    expect(exerciseCards()).toHaveLength(0);
  });

  it("openSettings (?schedule=edit) → mở sẵn modal Cài đặt lịch tuần", () => {
    render(<WorkoutLogger exercises={ALL} today={TUE} openSettings />);
    expect(screen.getByRole("dialog", { name: "Cài đặt lịch tuần" })).toBeInTheDocument();
  });
});

// ---------- Widget Tổng quan ----------

describe("TodayWorkoutWidget (Tổng quan)", () => {
  it("ngày gym: thứ theo ngày VN, tên template, danh sách bài, nút 'Bắt đầu tập' → /workouts?start=today", () => {
    render(<TodayWorkoutWidget today={THU} schedule={DEFAULT_WEEKLY_SCHEDULE} />);
    expect(screen.getByText("Thứ 5")).toBeInTheDocument();
    expect(screen.getByTestId("today-template")).toHaveTextContent("Lower Body 2");
    expect(screen.getByText("Goblet Squat")).toBeInTheDocument();
    expect(screen.queryByText(/bài nữa/)).not.toBeInTheDocument(); // 4 bài chính, hiện đủ
    expect(screen.getByText(/\+ Đốt Mỡ Cuối Buổi: Vung tạ ấm · Bật nhảy dang tay chân · Bọ chết · Nâng hông/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bắt đầu tập" })).toHaveAttribute("href", "/workouts?start=today");
    expect(screen.getByText(/Ngày mai/)).toHaveTextContent("Ngày mai: Upper Body B");
    expect(screen.getByRole("link", { name: /Đổi lịch/ })).toHaveAttribute("href", "/workouts?schedule=edit");
  });

  it("đổi lịch (T3 = Lower Body 1) → widget đọc lịch mới", () => {
    const custom = [...DEFAULT_WEEKLY_SCHEDULE];
    custom[2] = "lower-1";
    render(<TodayWorkoutWidget today={TUE} schedule={custom} />);
    expect(screen.getByText("Thứ 3")).toBeInTheDocument();
    expect(screen.getByTestId("today-template")).toHaveTextContent("Lower Body 1");
  });

  it("ngày yoga → nút xem hướng dẫn giãn cơ; ngày nghỉ → lời nhắn, không có nút bắt đầu", () => {
    const { unmount } = render(<TodayWorkoutWidget today="2026-11-11" schedule={DEFAULT_WEEKLY_SCHEDULE} />); // Thứ 4
    expect(screen.getByRole("link", { name: "Xem video giãn cơ" })).toHaveAttribute("href", "/workouts#yoga-videos");
    expect(screen.queryByRole("link", { name: "Bắt đầu tập" })).not.toBeInTheDocument();
    unmount();

    render(<TodayWorkoutWidget today="2026-11-15" schedule={DEFAULT_WEEKLY_SCHEDULE} />); // Chủ nhật
    expect(screen.getByText("Chủ nhật")).toBeInTheDocument();
    expect(screen.getByText(/Hôm nay là ngày nghỉ/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bắt đầu tập" })).not.toBeInTheDocument();
    expect(screen.getByText(/Ngày mai/)).toHaveTextContent("Ngày mai: Lower Body 1");
  });
});
