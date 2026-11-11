import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Server Actions là module "use server" import DB → mock toàn bộ.
vi.mock("@/actions/workout-logs", () => ({
  createWorkoutLog: vi.fn(),
  updateWorkoutLog: vi.fn(),
  deleteWorkoutLog: vi.fn(),
  saveWorkoutSets: vi.fn(),
}));
vi.mock("@/actions/daily-logs", () => ({ upsertDailyLog: vi.fn() }));

import * as workoutActions from "@/actions/workout-logs";
import { upsertDailyLog } from "@/actions/daily-logs";
import { WorkoutLogger, type GymExercise } from "@/components/WorkoutLogger";
import { CalorieIntakeCard } from "@/components/dashboard/CalorieIntakeCard";
import { YogaHabitCard } from "@/components/dashboard/YogaHabitCard";

const actions = vi.mocked(workoutActions);
const upsert = vi.mocked(upsertDailyLog);

const EXERCISES: GymExercise[] = [
  {
    id: 1,
    name: "Romanian Deadlift (RDL)",
    category: "gym",
    muscleGroup: "Đùi sau, Mông",
    instruction: "Đứng thẳng, gối hơi chùng.\nĐẩy hông ra sau.\nLưu ý: Không cong lưng.",
    gifUrl: "https://example.com/rdl.png",
    imageCredit: "wger.de · CC BY-SA 4.0",
  },
  {
    id: 2,
    name: "Hip Thrust",
    category: "gym",
    muscleGroup: "Mông",
    instruction: null,
    gifUrl: null,
    imageCredit: null,
  },
];

// ---------- WorkoutLogger ----------

describe("WorkoutLogger", () => {
  const setup = () => {
    const user = userEvent.setup();
    render(<WorkoutLogger exercises={EXERCISES} today="2026-11-11" />);
    return { user };
  };

  const addExercise = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.selectOptions(screen.getByLabelText("Thêm bài tập gym"), name);
    await user.click(screen.getByRole("button", { name: "Thêm" }));
  };

  it("render đúng trạng thái ban đầu", () => {
    setup();
    expect(screen.getByLabelText("Ngày tập")).toHaveValue("2026-11-11");
    expect(screen.getByRole("option", { name: "Romanian Deadlift (RDL)" })).toBeInTheDocument();
    // Chưa chọn bài → nút Thêm bị khoá; chưa có set → Save bị khoá
    expect(screen.getByRole("button", { name: "Thêm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save Workout/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ Add Set" })).not.toBeInTheDocument();
  });

  it("báo khi chưa có bài tập nào trong DB", () => {
    render(<WorkoutLogger exercises={[]} today="2026-11-11" />);
    expect(screen.getByText("Chưa có bài tập gym nào trong hệ thống.")).toBeInTheDocument();
  });

  it("thêm bài tập → hiện form nhập nhanh, bài đã chọn bị khoá trong danh sách", async () => {
    const { user } = setup();
    await addExercise(user, "Romanian Deadlift (RDL)");

    expect(screen.getByRole("button", { name: "Xem hướng dẫn Romanian Deadlift (RDL)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Số set")).toHaveValue("3");
    expect(screen.getByLabelText("Số rep")).toHaveValue("10");
    expect(screen.getByLabelText("Tạ (kg)")).toHaveValue("");
    expect(screen.getByRole("button", { name: "+ Add Set" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Romanian Deadlift (RDL)" })).toBeDisabled();
  });

  it("Add Set tạo đúng số set với rep/tạ đã nhập (chấp nhận dấu phẩy)", async () => {
    const { user } = setup();
    await addExercise(user, "Romanian Deadlift (RDL)");

    await user.clear(screen.getByLabelText("Số set"));
    await user.type(screen.getByLabelText("Số set"), "2");
    await user.clear(screen.getByLabelText("Số rep"));
    await user.type(screen.getByLabelText("Số rep"), "8");
    await user.type(screen.getByLabelText("Tạ (kg)"), "42,5");
    await user.click(screen.getByRole("button", { name: "+ Add Set" }));

    expect(screen.getAllByText("8 rep × 42.5 kg")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Save Workout · 2 set" })).toBeEnabled();
  });

  it("bỏ trống tạ → hiển thị BW (bodyweight); xoá được từng set", async () => {
    const { user } = setup();
    await addExercise(user, "Hip Thrust");
    await user.click(screen.getByRole("button", { name: "+ Add Set" }));

    expect(screen.getAllByText("10 rep × BW")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Xoá set 1" }));
    expect(screen.getAllByText("10 rep × BW")).toHaveLength(2);
  });

  it.each([
    ["Số set", "0", "Số set phải từ 1 đến 20."],
    ["Số rep", "abc", "Số rep phải là số nguyên ≥ 1."],
    ["Tạ (kg)", "-5", "Mức tạ không hợp lệ (0–1000 kg)."],
  ])("input sai ở %s → báo lỗi, không crash, không thêm set", async (label, value, message) => {
    const { user } = setup();
    await addExercise(user, "Hip Thrust");
    await user.clear(screen.getByLabelText(label));
    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "+ Add Set" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(/rep ×/)).not.toBeInTheDocument();
  });

  it("Save Workout gọi createWorkoutLog rồi saveWorkoutSets với setNumber đúng", async () => {
    actions.createWorkoutLog.mockResolvedValue({
      ok: true,
      data: { id: 77, userId: "u", date: "2026-11-11", notes: null },
    });
    actions.saveWorkoutSets.mockImplementation(async ({ sets }) => ({
      ok: true,
      data: sets.map((s, i) => ({ id: i, workoutLogId: 77, ...s, weight: s.weight ?? null })),
    }));

    const { user } = setup();
    await addExercise(user, "Romanian Deadlift (RDL)");
    await user.type(screen.getByLabelText("Tạ (kg)"), "40");
    await user.click(screen.getByRole("button", { name: "+ Add Set" }));
    await addExercise(user, "Hip Thrust");
    const hipCard = screen.getByRole("button", { name: "Xem hướng dẫn Hip Thrust" }).closest("section")!;
    await user.clear(within(hipCard).getByLabelText("Số set"));
    await user.type(within(hipCard).getByLabelText("Số set"), "1");
    await user.click(within(hipCard).getByRole("button", { name: "+ Add Set" }));

    await user.click(screen.getByRole("button", { name: "Save Workout · 4 set" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu 4 set (2 bài tập).");
    expect(actions.createWorkoutLog).toHaveBeenCalledWith({ date: "2026-11-11", notes: null });
    expect(actions.saveWorkoutSets).toHaveBeenCalledWith({
      workoutLogId: 77,
      sets: [
        { exerciseId: 1, setNumber: 1, reps: 10, weight: 40 },
        { exerciseId: 1, setNumber: 2, reps: 10, weight: 40 },
        { exerciseId: 1, setNumber: 3, reps: 10, weight: 40 },
        { exerciseId: 2, setNumber: 1, reps: 10, weight: null },
      ],
    });
    // Lần lưu sau sẽ là "Cập nhật" và có nút "Buổi mới"
    // isPending của transition tắt sau khi status đã hiện → chờ nút đổi nhãn
    expect(await screen.findByRole("button", { name: /^Cập nhật/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buổi mới" })).toBeInTheDocument();
  });

  it("lưu set thất bại → rollback buổi tập vừa tạo và hiện lỗi", async () => {
    actions.createWorkoutLog.mockResolvedValue({
      ok: true,
      data: { id: 88, userId: "u", date: "2026-11-11", notes: null },
    });
    actions.saveWorkoutSets.mockResolvedValue({ ok: false, error: "Đã có lỗi xảy ra, vui lòng thử lại." });
    actions.deleteWorkoutLog.mockResolvedValue({ ok: true, data: { id: 88 } });

    const { user } = setup();
    await addExercise(user, "Hip Thrust");
    await user.click(screen.getByRole("button", { name: "+ Add Set" }));
    await user.click(screen.getByRole("button", { name: /Save Workout/ }));

    await waitFor(() => expect(actions.deleteWorkoutLog).toHaveBeenCalledWith(88));
    // `isPending` của transition tắt sau khi rollback chạy → chờ bằng findBy (tránh race)
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lỗi xảy ra, vui lòng thử lại.");
    expect(await screen.findByRole("button", { name: /Save Workout/ })).toBeInTheDocument();
  });

  it("bấm tên bài tập → mở modal hướng dẫn, đóng được", async () => {
    const { user } = setup();
    await addExercise(user, "Romanian Deadlift (RDL)");
    await user.click(screen.getByRole("button", { name: "Xem hướng dẫn Romanian Deadlift (RDL)" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Romanian Deadlift (RDL)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: /Minh hoạ tư thế/ })).toHaveAttribute(
      "src",
      "https://example.com/rdl.png",
    );
    expect(within(dialog).getByText("Đùi sau")).toBeInTheDocument();
    expect(within(dialog).getByText("Đẩy hông ra sau.")).toBeInTheDocument();
    expect(within(dialog).getByText("Không cong lưng.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Đã hiểu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

// ---------- WorkoutLogger · Gợi ý hôm nay / Lịch tuần / Swap ----------

describe("WorkoutLogger — gợi ý hôm nay, lịch tuần, thay thế bài", () => {
  const ex = (
    id: number,
    name: string,
    muscleGroup: string,
    recommendedWeight: string | null = null,
    tips: string | null = null,
  ): GymExercise => ({
    id,
    name,
    category: "gym",
    muscleGroup,
    instruction: null,
    gifUrl: null,
    imageCredit: null,
    recommendedWeight,
    tips,
  });
  // Đủ bài cho Lower Body 1 + vài bài để swap; thiếu "Step-up" của Lower Body 2.
  const TPL_EXERCISES = [
    ex(10, "Hip Thrust", "Mông, Đùi sau", "20–30 kg (thanh đòn)", "Có thể thay bằng tạ đơn 15 kg đặt lên hông."),
    ex(11, "Romanian Deadlift (RDL)", "Đùi sau, Mông, Lưng dưới", "15–20 kg tổng cộng"),
    ex(12, "Bulgarian Split Squat", "Đùi trước, Mông", "Bodyweight → 3–5 kg mỗi tay", "Đổ người hơi về trước."),
    ex(13, "Lying Leg Curl", "Đùi sau", "10–15 kg"),
    ex(14, "Cable Kickback", "Mông", "5–7,5 kg cáp"),
    ex(15, "Glute Bridge", "Mông, Đùi sau"),
    ex(16, "Goblet Squat", "Đùi trước, Mông", "10–15 kg"),
    ex(17, "Leg Press", "Đùi trước, Mông", "30–40 kg"),
    ex(18, "Hip Abduction", "Mông nhỡ (mông bên), Hông", "15–20 kg", "Giữ 1 giây ở điểm mở rộng nhất."),
    ex(19, "Leg Extension", "Đùi trước", "10–15 kg"),
    ex(20, "Plank", "Core (Bụng)"),
  ];
  const MONDAY = "2026-11-09";
  const WEDNESDAY = "2026-11-11";
  const THURSDAY = "2026-11-12";
  const SUNDAY = "2026-11-15";

  const setup = (today: string) => {
    const user = userEvent.setup();
    render(<WorkoutLogger exercises={TPL_EXERCISES} today={today} />);
    return { user };
  };
  const cardNames = () =>
    screen
      .queryAllByRole("button", { name: /^Xem hướng dẫn / })
      .map((b) => b.getAttribute("aria-label")!.replace("Xem hướng dẫn ", ""));
  const card = (name: string) => screen.getByRole("button", { name: `Xem hướng dẫn ${name}` }).closest("section")!;

  it("không còn 3 nút 'Thêm nhanh' cũ", () => {
    setup(MONDAY);
    expect(screen.queryByRole("button", { name: /^Thêm nhanh/ })).not.toBeInTheDocument();
  });

  it("Thứ 2 → gợi ý Lower Body 1, hiện danh sách bài + tạ gợi ý", () => {
    setup(MONDAY);
    expect(screen.getByRole("heading", { name: "Gợi ý bài tập cho hôm nay (Thứ 2)" })).toBeInTheDocument();
    const block = screen.getByRole("region", { name: /Gợi ý bài tập/ });
    expect(within(block).getByText("Lower Body 1")).toBeInTheDocument();
    expect(within(block).getByText("Cable Kickback")).toBeInTheDocument();
    expect(within(block).getByText("20–30 kg (thanh đòn)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu bài tập hôm nay" })).toBeEnabled();
  });

  it("Bắt đầu bài tập hôm nay → load đúng bài theo thứ tự, kèm tạ gợi ý + tips trên form", async () => {
    const { user } = setup(MONDAY);
    await user.click(screen.getByRole("button", { name: "Bắt đầu bài tập hôm nay" }));

    expect(cardNames()).toEqual([
      "Hip Thrust",
      "Romanian Deadlift (RDL)",
      "Bulgarian Split Squat",
      "Lying Leg Curl",
      "Cable Kickback",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Đã thêm 5 bài từ Lower Body 1.");
    expect(screen.getAllByLabelText("Số set")[0]).toHaveValue("3");
    expect(screen.getByRole("button", { name: "✓ Đã thêm vào buổi tập" })).toBeDisabled();

    const hip = card("Hip Thrust");
    const hint = within(hip).getByText("20–30 kg (thanh đòn)");
    expect(within(hip).getByText(/tạ đơn 15 kg đặt lên hông/)).toBeInTheDocument();
    const form = within(hip).getByLabelText("Số set").closest("form")!;
    expect(hint.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bài thiếu trong DB được báo (Thứ 5 → Lower Body 2 thiếu Step-up)", async () => {
    const { user } = setup(THURSDAY);
    expect(screen.getByRole("heading", { name: "Gợi ý bài tập cho hôm nay (Thứ 5)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bắt đầu bài tập hôm nay" }));
    expect(cardNames()).toEqual(["Goblet Squat", "Leg Press", "Hip Abduction", "Leg Extension"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 bài chưa có trong hệ thống");
  });

  it("Thứ 4 → Active Rest / Yoga: không có nút bắt đầu, có link tới thư viện yoga", () => {
    setup(WEDNESDAY);
    expect(within(screen.getByRole("region", { name: /Gợi ý bài tập/ })).getByText("Active Rest / Yoga")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bắt đầu bài tập/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Xem hướng dẫn giãn cơ/ })).toHaveAttribute("href", "#yoga-library");
  });

  it("Chủ nhật → ngày nghỉ", () => {
    setup(SUNDAY);
    expect(screen.getByRole("heading", { name: "Gợi ý bài tập cho hôm nay (Chủ nhật)" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: /Gợi ý bài tập/ })).getByText("Nghỉ ngơi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bắt đầu bài tập/ })).not.toBeInTheDocument();
  });

  it("đổi ngày tập → gợi ý đổi theo thứ của ngày đó", async () => {
    const { user } = setup(WEDNESDAY);
    const dateInput = screen.getByLabelText("Ngày tập");
    await user.clear(dateInput);
    await user.type(dateInput, MONDAY);
    expect(screen.getByRole("heading", { name: "Gợi ý bài tập cho Thứ 2, 09/11" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu bài tập ngày này" })).toBeInTheDocument();
  });

  it("lịch tuần cá nhân (prop schedule) được ưu tiên hơn lịch mặc định", () => {
    const user = ["rest", "upper-b", "upper-a", "active-rest", "lower-2", "lower-1", "rest"];
    render(<WorkoutLogger exercises={TPL_EXERCISES} today={MONDAY} schedule={user} />);
    expect(within(screen.getByRole("region", { name: /Gợi ý bài tập/ })).getByText("Upper Body B")).toBeInTheDocument();
  });

  it("Xem lịch cả tuần → timeline Thứ 2 → Chủ nhật; chọn 'Tập buổi này' để load buổi khác", async () => {
    const { user } = setup(SUNDAY);
    await user.click(screen.getByRole("button", { name: /Xem lịch cả tuần/ }));

    const dialog = screen.getByRole("dialog", { name: "Lịch tập cả tuần" });
    const days = within(dialog).getAllByRole("listitem");
    expect(days.map((d) => d.textContent?.match(/^(Thứ \d|Chủ nhật)/)?.[0])).toEqual([
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ]);
    expect(days[0]).toHaveTextContent("Lower Body 1");
    expect(days[1]).toHaveTextContent("Upper Body A");
    expect(days[2]).toHaveTextContent("Active Rest / Yoga");
    expect(days[3]).toHaveTextContent("Lower Body 2");
    expect(days[4]).toHaveTextContent("Upper Body B");
    expect(days[6]).toHaveAttribute("aria-current", "date"); // Chủ nhật đang xem
    // Ngày yoga / nghỉ không có nút tập
    expect(within(days[2]).queryByRole("button")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Tập buổi Lower Body 1 (Thứ 2)" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(cardNames()).toHaveLength(5);
  });

  it("Swap: chỉ gợi ý bài cùng nhóm cơ chính chưa có trong buổi tập; chọn → đổi bài ngay, giữ set đã nhập", async () => {
    const { user } = setup(MONDAY);
    await user.click(screen.getByRole("button", { name: "Bắt đầu bài tập hôm nay" }));

    // Nhập 2 set cho Hip Thrust trước khi đổi
    const hip = card("Hip Thrust");
    await user.clear(within(hip).getByLabelText("Số set"));
    await user.type(within(hip).getByLabelText("Số set"), "2");
    await user.type(within(hip).getByLabelText("Tạ (kg)"), "25");
    await user.click(within(hip).getByRole("button", { name: "+ Add Set" }));

    const swapBtn = within(hip).getByRole("button", { name: "Thay thế Hip Thrust" });
    expect(swapBtn).toHaveAttribute("aria-expanded", "false");
    await user.click(swapBtn);
    expect(swapBtn).toHaveAttribute("aria-expanded", "true");

    // Nhóm chính "Mông": Cable Kickback đã có trong buổi → chỉ còn Glute Bridge
    const options = within(hip).getAllByRole("button", { name: /^Đổi sang / });
    expect(options.map((o) => o.getAttribute("aria-label"))).toEqual(["Đổi sang Glute Bridge"]);

    await user.click(options[0]);
    expect(cardNames()).toEqual([
      "Glute Bridge",
      "Romanian Deadlift (RDL)",
      "Bulgarian Split Squat",
      "Lying Leg Curl",
      "Cable Kickback",
    ]);
    const bridge = card("Glute Bridge");
    expect(within(bridge).getAllByText("10 rep × 25 kg")).toHaveLength(2);
    expect(within(bridge).getByLabelText("Tạ (kg)")).toHaveValue(""); // mức tạ nháp được xoá
    expect(within(bridge).queryByRole("button", { name: /^Đổi sang / })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đã thay Hip Thrust bằng Glute Bridge.");

    // Lưu: set gắn với bài mới
    actions.createWorkoutLog.mockResolvedValue({ ok: true, data: { id: 7 } } as never);
    actions.saveWorkoutSets.mockResolvedValue({ ok: true, data: [{}, {}] } as never);
    await user.click(screen.getByRole("button", { name: /Save Workout/ }));
    await waitFor(() => expect(actions.saveWorkoutSets).toHaveBeenCalled());
    expect(actions.saveWorkoutSets.mock.calls.at(-1)![0]).toEqual({
      workoutLogId: 7,
      sets: [
        { exerciseId: 15, setNumber: 1, reps: 10, weight: 25 },
        { exerciseId: 15, setNumber: 2, reps: 10, weight: 25 },
      ],
    });
  });

  it("Swap: không có bài phù hợp → báo rõ", async () => {
    const { user } = setup(SUNDAY);
    await user.selectOptions(screen.getByLabelText("Thêm bài tập gym"), "Leg Extension");
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    await user.selectOptions(screen.getByLabelText("Thêm bài tập gym"), "Hip Abduction");
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    await user.click(screen.getByRole("button", { name: "Thay thế Hip Abduction" }));
    expect(screen.getByText("Chưa có bài thay thế phù hợp.")).toBeInTheDocument();
  });
});

// ---------- CalorieIntakeCard ----------

describe("CalorieIntakeCard", () => {
  beforeEach(() => {
    upsert.mockImplementation(async ({ totalCalories }) => ({
      ok: true,
      data: {
        id: 1,
        userId: "u",
        date: "2026-11-11",
        totalCalories: totalCalories ?? 0,
        yogaCompleted: false,
        notes: null,
      },
    }));
  });

  it("render ô nhập + nút Lưu (khoá khi chưa thay đổi) + số kcal còn lại", () => {
    render(<CalorieIntakeCard date="2026-11-11" initialCalories={800} calorieGoal={1400} />);
    expect(screen.getByLabelText("Tổng lượng Calo nạp vào hôm nay")).toHaveValue("800");
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    expect(screen.getByText(/Còn/)).toHaveTextContent("Còn 600 kcal so với mục tiêu");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "800");
  });

  it("chỉ nhận chữ số — gõ ký tự lạ không crash", async () => {
    const user = userEvent.setup();
    render(<CalorieIntakeCard date="2026-11-11" initialCalories={0} calorieGoal={null} />);
    const input = screen.getByLabelText("Tổng lượng Calo nạp vào hôm nay");

    await user.type(input, "1a2-3.4e");
    expect(input).toHaveValue("1234");
    // Không có mục tiêu → không hiện thanh tiến độ
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("submit gọi upsertDailyLog với số đã nhập và cập nhật phần còn lại", async () => {
    const user = userEvent.setup();
    render(<CalorieIntakeCard date="2026-11-11" initialCalories={0} calorieGoal={1400} />);

    await user.type(screen.getByLabelText("Tổng lượng Calo nạp vào hôm nay"), "1650");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(upsert).toHaveBeenCalledWith({ date: "2026-11-11", totalCalories: 1650 });
    expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu.");
    expect(screen.getByText(/Vượt mục tiêu/)).toHaveTextContent("Vượt mục tiêu 250 kcal");
  });

  it("số quá lớn → báo lỗi, không gọi action", async () => {
    const user = userEvent.setup();
    render(<CalorieIntakeCard date="2026-11-11" initialCalories={0} calorieGoal={1400} />);

    await user.type(screen.getByLabelText("Tổng lượng Calo nạp vào hôm nay"), "99999");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Nhập số nguyên từ 0 đến 20000.");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("action lỗi → hiện thông báo lỗi từ server", async () => {
    upsert.mockResolvedValue({ ok: false, error: "Bạn cần đăng nhập." });
    const user = userEvent.setup();
    render(<CalorieIntakeCard date="2026-11-11" initialCalories={0} calorieGoal={1400} />);

    await user.type(screen.getByLabelText("Tổng lượng Calo nạp vào hôm nay"), "500");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn cần đăng nhập.");
  });
});

// ---------- YogaHabitCard ----------

describe("YogaHabitCard", () => {
  const checkbox = () =>
    screen.getByRole("checkbox", { name: /Đã tập Yoga giãn cơ 30 phút tối nay/ });

  it("tick → tự lưu yogaCompleted = true", async () => {
    upsert.mockResolvedValue({
      ok: true,
      data: { id: 1, userId: "u", date: "2026-11-11", totalCalories: 0, yogaCompleted: true, notes: null },
    });
    const user = userEvent.setup();
    render(<YogaHabitCard date="2026-11-11" initialCompleted={false} />);

    expect(checkbox()).not.toBeChecked();
    await user.click(checkbox());

    expect(checkbox()).toBeChecked();
    expect(upsert).toHaveBeenCalledWith({ date: "2026-11-11", yogaCompleted: true });
    expect(await screen.findByText(/Đã ghi nhận/)).toBeInTheDocument();
  });

  it("lưu thất bại → hoàn tác dấu tick và báo lỗi", async () => {
    upsert.mockResolvedValue({ ok: false, error: "Đã có lỗi xảy ra, vui lòng thử lại." });
    const user = userEvent.setup();
    render(<YogaHabitCard date="2026-11-11" initialCompleted={false} />);

    await user.click(checkbox());

    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lỗi xảy ra");
    expect(checkbox()).not.toBeChecked();
  });
});
