import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
// Server Actions là module "use server" import DB → mock toàn bộ.
vi.mock("@/actions/workout-logs", () => ({
  addWorkoutSet: vi.fn(),
  updateWorkoutSet: vi.fn(),
  deleteWorkoutSet: vi.fn(),
  changeWorkoutExercise: vi.fn(),
  removeWorkoutExercise: vi.fn(),
  saveWorkoutNotes: vi.fn(),
}));
vi.mock("@/actions/schedule", () => ({ updateWeeklySchedule: vi.fn() }));

import * as workoutActions from "@/actions/workout-logs";
import { WorkoutLogger, type GymExercise } from "@/components/WorkoutLogger";
import type { WorkoutSet } from "@/db/schema";

const actions = vi.mocked(workoutActions);

const ex = (
  id: number,
  name: string,
  muscleGroup: string,
  extra: Partial<GymExercise> = {},
): GymExercise => ({ id, name, category: "gym", muscleGroup, instruction: null, gifUrl: null, imageCredit: null, phase: "main", ...extra });

// Đủ bài cho Lower Body 1 (chính + đốt mỡ); Lower Body 2 thiếu Step-up / Dead Bug.
const EXERCISES: GymExercise[] = [
  ex(10, "Hip Thrust", "Mông, Đùi sau", { recommendedWeight: "20–30 kg (thanh đòn)", tips: "Siết mông 1 giây ở điểm cao." }),
  ex(11, "Romanian Deadlift (RDL)", "Đùi sau, Mông, Lưng dưới", {
    recommendedWeight: "15–20 kg tổng cộng",
    instruction: "Đứng thẳng, gối hơi chùng.\nĐẩy hông ra sau.\nLưu ý: Không cong lưng.",
    gifUrl: "https://example.com/rdl.png",
    imageCredit: "wger.de · CC BY-SA 4.0",
  }),
  ex(12, "Bulgarian Split Squat", "Đùi trước, Mông"),
  ex(13, "Good Morning", "Đùi sau, Mông"),
  ex(16, "Goblet Squat", "Đùi trước, Mông"),
  ex(17, "Leg Press", "Đùi trước, Mông"),
  ex(18, "Hip Abduction", "Mông nhỡ"),
  ex(30, "Kettlebell Swing", "Mông, Core", { phase: "finisher" }),
  ex(31, "Plank", "Core (Bụng)", { phase: "finisher" }),
  ex(32, "Crunch", "Bụng trên", { phase: "finisher" }),
  ex(33, "Glute Bridge", "Mông, Đùi sau", { phase: "finisher" }),
  ex(34, "Jumping Jack", "Toàn thân", { phase: "finisher" }),
];
const MONDAY = "2026-11-09"; // Lower Body 1
const WEDNESDAY = "2026-11-11"; // Active Rest / Yoga
const THURSDAY = "2026-11-12"; // Lower Body 2
const SUNDAY = "2026-11-15"; // Nghỉ

// ---------- DB giả cho Server Actions ----------

let nextId = 100;
const LOG_ID = 7;
function fakeServer() {
  actions.addWorkoutSet.mockImplementation(async (input) => {
    const set = {
      id: nextId++,
      workoutLogId: LOG_ID,
      exerciseId: input.exerciseId,
      phase: input.phase,
      setNumber: 1,
      reps: input.phase === "main" ? input.reps : null,
      weight: input.phase === "main" ? input.weight : null,
      durationSec: input.phase === "finisher" ? (input.durationSec ?? null) : null,
      completed: input.phase === "finisher" ? (input.completed ?? true) : false,
    } satisfies WorkoutSet;
    return { ok: true, data: { logId: LOG_ID, set } };
  });
  actions.updateWorkoutSet.mockImplementation(async ({ id }) => ({ ok: true, data: { id } as WorkoutSet }));
  actions.deleteWorkoutSet.mockImplementation(async (id) => ({ ok: true, data: { id } }));
  actions.changeWorkoutExercise.mockResolvedValue({ ok: true, data: { count: 1 } });
  actions.removeWorkoutExercise.mockResolvedValue({ ok: true, data: { count: 1 } });
  actions.saveWorkoutNotes.mockResolvedValue({ ok: true, data: { logId: LOG_ID } });
}

/** Promise tự giải quyết bằng tay — kiểm tra giao diện TRƯỚC khi server trả lời (optimistic). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  nextId = 100;
  fakeServer();
});

const setup = (props: Partial<Parameters<typeof WorkoutLogger>[0]> = {}) => {
  const user = userEvent.setup();
  render(<WorkoutLogger exercises={EXERCISES} today={MONDAY} {...props} />);
  return { user };
};
const mainCard = (name: string) => screen.getByRole("region", { name });
const startToday = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Bắt đầu bài tập/ }));
const finisherRow = (label: RegExp) => screen.getByRole("checkbox", { name: label }).closest("li")!;
const status = () => screen.getByTestId("autosave-status");

// ---------- Bố cục 2 khu vực + không còn nút Save ----------

describe("WorkoutLogger — bố cục & lịch tập mẫu", () => {
  it("2 khu vực có tiêu đề lớn, không còn nút Save Workout / Cập nhật, báo tự động lưu", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2, name: "Bài tập chính" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Đốt mỡ cuối buổi (10-15 Phút)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Workout|Cập nhật/ })).not.toBeInTheDocument();
    expect(status()).toHaveTextContent("Mọi thay đổi được lưu tự động");
  });

  it("Thứ 2 = Lower Body 1: 'Bắt đầu' nạp 3 bài chính + chuỗi 4 bài đốt mỡ (tên Việt + mục tiêu), chưa ghi DB", async () => {
    const { user } = setup();
    const today = screen.getByRole("region", { name: /Gợi ý bài tập cho hôm nay \(Thứ 2\)/ });
    expect(today).toHaveTextContent("+ Đốt Mỡ Cuối Buổi: Vung tạ ấm · Plank · Gập bụng · Nâng hông");
    await startToday(user);

    const mains = screen.getAllByRole("region").filter((r) => r.dataset.phase === "main");
    expect(mains.map((r) => r.getAttribute("aria-label"))).toEqual(["Hip Thrust", "Romanian Deadlift (RDL)", "Bulgarian Split Squat"]);
    const finisher = screen.getAllByTestId("finisher-row").map((r) => r.textContent);
    expect(finisher[0]).toMatch(/1\. Vung tạ ấm \(Kettlebell Swing\)Mỗi vòng: 15 lần/);
    expect(finisher[1]).toMatch(/2\. PlankMỗi vòng: 40 giây/);
    expect(finisher[2]).toMatch(/3\. Gập bụng \(Crunch\)Mỗi vòng: 15 lần/);
    expect(finisher[3]).toMatch(/4\. Nâng hông \(Glute Bridge\)Mỗi vòng: 20 lần/);
    expect(screen.getByTestId("finisher-progress")).toHaveTextContent("Đã xong 0 / 4 bài");
    expect(within(mainCard("Hip Thrust")).getByText(/Tạ gợi ý:/).closest("p")).toHaveTextContent("Tạ gợi ý: 20–30 kg (thanh đòn)");
    // Thêm bài vào buổi chưa phải là ghi DB (chưa tập hiệp nào)
    expect(actions.addWorkoutSet).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "✓ Đã thêm vào buổi tập" })).toBeDisabled();
  });

  it("Thứ 5 = Lower Body 2 thiếu bài trong DB → báo; Thứ 4 yoga / Chủ nhật nghỉ → không có nút bắt đầu", async () => {
    const { user } = setup({ today: THURSDAY });
    await startToday(user);
    expect(screen.getByText(/bài chưa có trong hệ thống \(cần chạy db:seed\)/)).toBeInTheDocument();
  });

  it.each([
    [WEDNESDAY, /Xem video giãn cơ/],
    [SUNDAY, /Cơ bắp phát triển trong lúc nghỉ/],
  ])("%s → không có nút bắt đầu bài gym", (day, text) => {
    setup({ today: day });
    expect(screen.queryByRole("button", { name: /^Bắt đầu bài tập/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it("thêm bài thủ công: bài đốt mỡ vào khu Đốt mỡ, bài tạ vào Bài tập chính", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("Thêm bài tập"), "Bật nhảy dang tay chân (Jumping Jack)");
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    await user.selectOptions(screen.getByLabelText("Thêm bài tập"), "Good Morning");
    await user.click(screen.getByRole("button", { name: "Thêm" }));
    expect(screen.getByRole("checkbox", { name: /Bật nhảy dang tay chân/ })).toBeInTheDocument();
    expect(mainCard("Good Morning").dataset.phase).toBe("main");
  });

  it("đổi ngày tập → chuyển URL ?date= (server nạp buổi tập của ngày đó)", async () => {
    setup({ today: THURSDAY, date: MONDAY });
    // Ô ngày là controlled (giá trị theo URL) → giả lập chọn ngày trong date picker
    const input = screen.getByLabelText("Ngày tập");
    expect(input).toHaveValue(MONDAY);
    fireEvent.change(input, { target: { value: "2026-11-10" } });
    expect(nav.push).toHaveBeenLastCalledWith("/workouts?date=2026-11-10");
    fireEvent.change(input, { target: { value: THURSDAY } });
    expect(nav.push).toHaveBeenLastCalledWith("/workouts"); // hôm nay → URL gọn
    nav.push.mockClear();
    fireEvent.change(input, { target: { value: "2026-11-20" } }); // tương lai → bỏ qua
    expect(nav.push).not.toHaveBeenCalled();
  });
});

// ---------- Auto-save: Bài Tập Chính ----------

describe("WorkoutLogger — auto-save Bài Tập Chính", () => {
  it("+ Thêm hiệp: hiện ngay (optimistic) rồi mới lưu xong; hiệp sau chép rep / kg hiệp trước", async () => {
    const pending = deferred<Awaited<ReturnType<typeof actions.addWorkoutSet>>>();
    actions.addWorkoutSet.mockImplementationOnce(() => pending.promise);
    const { user } = setup();
    await startToday(user);
    const card = mainCard("Hip Thrust");

    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    const row = within(card).getByTestId("set-row");
    expect(row).toHaveAttribute("data-saved", "false"); // đã hiện, chưa có id
    expect(within(card).getByLabelText("Số rep hiệp 1")).toHaveValue("10");
    expect(status()).toHaveTextContent("Đang lưu…");
    expect(actions.addWorkoutSet).toHaveBeenCalledWith({ phase: "main", date: MONDAY, exerciseId: 10, reps: 10, weight: null });

    await act(async () =>
      pending.resolve({
        ok: true,
        data: {
          logId: LOG_ID,
          set: { id: 55, workoutLogId: LOG_ID, exerciseId: 10, phase: "main", setNumber: 1, reps: 10, weight: null, durationSec: null, completed: false },
        },
      }),
    );
    expect(row).toHaveAttribute("data-saved", "true");
    expect(status()).toHaveTextContent(/Đã lưu lúc/);

    // Sửa kg → rời ô → lưu đúng hiệp (id 55)
    const kg = within(card).getByLabelText("Tạ (kg) hiệp 1");
    await user.type(kg, "42,5");
    await user.tab();
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 55, reps: 10, weight: 42.5 }));

    // Hiệp 2 chép 10 rep × 42,5 kg
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    expect(within(card).getByLabelText("Tạ (kg) hiệp 2")).toHaveValue("42,5");
    expect(actions.addWorkoutSet).toHaveBeenLastCalledWith({ phase: "main", date: MONDAY, exerciseId: 10, reps: 10, weight: 42.5 });
  });

  it("sửa hiệp khi lệnh thêm còn đang chạy → lệnh sửa xếp hàng sau, dùng đúng id vừa được tạo", async () => {
    const pending = deferred<Awaited<ReturnType<typeof actions.addWorkoutSet>>>();
    actions.addWorkoutSet.mockImplementationOnce(() => pending.promise);
    const { user } = setup();
    await startToday(user);
    const card = mainCard("Romanian Deadlift (RDL)");
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    await user.type(within(card).getByLabelText("Tạ (kg) hiệp 1"), "20");
    await user.tab();
    expect(actions.updateWorkoutSet).not.toHaveBeenCalled(); // còn chờ lệnh thêm

    await act(async () =>
      pending.resolve({
        ok: true,
        data: {
          logId: LOG_ID,
          set: { id: 77, workoutLogId: LOG_ID, exerciseId: 11, phase: "main", setNumber: 1, reps: 10, weight: null, durationSec: null, completed: false },
        },
      }),
    );
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 77, reps: 10, weight: 20 }));
  });

  it("gõ rồi dừng (không rời ô) → tự lưu sau ~0,7 giây; ô sai → báo tại chỗ, không lưu", async () => {
    const { user } = setup();
    await startToday(user);
    const card = mainCard("Hip Thrust");
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    await waitFor(() => expect(within(card).getByTestId("set-row")).toHaveAttribute("data-saved", "true"));

    const reps = within(card).getByLabelText("Số rep hiệp 1");
    await user.clear(reps);
    await user.type(reps, "12");
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 100, reps: 12, weight: null }), { timeout: 1500 });

    actions.updateWorkoutSet.mockClear();
    await user.clear(reps);
    await user.type(reps, "0");
    await user.tab();
    expect(within(card).getByRole("alert")).toHaveTextContent("Hiệp 1: Số rep phải là số nguyên từ 1 đến 1000. (chưa lưu)");
    await new Promise((r) => setTimeout(r, 800));
    expect(actions.updateWorkoutSet).not.toHaveBeenCalled();
  });

  it("xoá hiệp: mất ngay + xoá trong DB; server lỗi → hiệp quay lại đúng chỗ, báo lỗi", async () => {
    const { user } = setup();
    await startToday(user);
    const card = mainCard("Hip Thrust");
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    await waitFor(() => expect(within(card).getAllByTestId("set-row")[1]).toHaveAttribute("data-saved", "true"));

    actions.deleteWorkoutSet.mockResolvedValueOnce({ ok: false, error: "Không tìm thấy hiệp tập." });
    await user.click(within(card).getByRole("button", { name: "Xoá hiệp 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy hiệp tập.");
    expect(within(card).getAllByTestId("set-row")).toHaveLength(2);
    expect(actions.deleteWorkoutSet).toHaveBeenCalledWith(100);

    await user.click(within(card).getByRole("button", { name: "Xoá hiệp 1" }));
    await waitFor(() => expect(within(card).getAllByTestId("set-row")).toHaveLength(1));
    expect(actions.deleteWorkoutSet).toHaveBeenLastCalledWith(100);
  });

  it("thêm hiệp thất bại → hiệp biến mất, báo lỗi", async () => {
    actions.addWorkoutSet.mockResolvedValueOnce({ ok: false, error: "Bạn cần đăng nhập." });
    const { user } = setup();
    await startToday(user);
    const card = mainCard("Hip Thrust");
    await user.click(within(card).getByRole("button", { name: "+ Thêm hiệp" }));
    await waitFor(() => expect(within(card).queryAllByTestId("set-row")).toHaveLength(0));
    expect(status()).toHaveTextContent("Bạn cần đăng nhập.");
  });

  it("buổi đã lưu (tải lại trang) → dựng lại đúng hiệp / dòng đốt mỡ, sửa dùng id có sẵn", async () => {
    const user = userEvent.setup();
    const sets = [
      { id: 1, exerciseId: 10, phase: "main" as const, setNumber: 1, reps: 10, weight: 30, durationSec: null, completed: false },
      { id: 2, exerciseId: 10, phase: "main" as const, setNumber: 2, reps: 8, weight: 32.5, durationSec: null, completed: false },
      { id: 3, exerciseId: 31, phase: "finisher" as const, setNumber: 1, reps: null, weight: null, durationSec: 40, completed: true },
    ];
    render(<WorkoutLogger exercises={EXERCISES} today={MONDAY} initialLog={{ logId: LOG_ID, notes: "Mệt", sets }} />);
    const card = mainCard("Hip Thrust");
    expect(within(card).getByLabelText("Tạ (kg) hiệp 2")).toHaveValue("32,5");
    expect(screen.getByRole("checkbox", { name: /Plank/ })).toBeChecked();
    expect(screen.getByLabelText("Thời gian (giây) — Plank")).toHaveValue("40");
    expect(screen.getByLabelText(/Ghi chú buổi tập/)).toHaveValue("Mệt");

    await user.clear(within(card).getByLabelText("Số rep hiệp 2"));
    await user.type(within(card).getByLabelText("Số rep hiệp 2"), "9");
    await user.tab();
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 2, reps: 9, weight: 32.5 }));
  });

  it("bỏ bài đã có hiệp → hỏi xác nhận → xoá mọi hiệp của bài trong DB; đổi bài → chuyển hiệp sang bài mới", async () => {
    const sets = [{ id: 1, exerciseId: 11, phase: "main" as const, setNumber: 1, reps: 10, weight: 20, durationSec: null, completed: false }];
    const user = userEvent.setup();
    render(<WorkoutLogger exercises={EXERCISES} today={MONDAY} initialLog={{ logId: LOG_ID, notes: null, sets }} />);

    // Đổi RDL → Good Morning (cùng nhóm Đùi sau, bài đốt mỡ không xuất hiện trong gợi ý)
    await user.click(screen.getByRole("button", { name: "Thay thế Romanian Deadlift (RDL)" }));
    expect(screen.queryByRole("button", { name: "Đổi sang Glute Bridge" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đổi sang Good Morning" }));
    await waitFor(() =>
      expect(actions.changeWorkoutExercise).toHaveBeenCalledWith({ logId: LOG_ID, fromExerciseId: 11, toExerciseId: 13 }),
    );

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Xoá bài Good Morning" }));
    expect(confirm).toHaveBeenLastCalledWith("Bỏ bài Good Morning? 1 dòng đã ghi sẽ bị xoá.");
    expect(actions.removeWorkoutExercise).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xoá bài Good Morning" }));
    await waitFor(() => expect(actions.removeWorkoutExercise).toHaveBeenCalledWith({ logId: LOG_ID, exerciseId: 13 }));
    expect(screen.queryByRole("region", { name: "Good Morning" })).not.toBeInTheDocument();
  });

  it("ghi chú tự lưu khi rời ô (chỉ khi có thay đổi)", async () => {
    const { user } = setup();
    const notes = screen.getByLabelText(/Ghi chú buổi tập/);
    await user.click(notes);
    await user.tab();
    expect(actions.saveWorkoutNotes).not.toHaveBeenCalled();
    await user.type(notes, "Nghỉ 2 phút giữa hiệp");
    await user.tab();
    await waitFor(() => expect(actions.saveWorkoutNotes).toHaveBeenCalledWith({ date: MONDAY, notes: "Nghỉ 2 phút giữa hiệp" }));
  });
});

// ---------- Auto-save: Đốt mỡ cuối buổi ----------

describe("WorkoutLogger — auto-save Đốt Mỡ Cuối Buổi", () => {
  it("tick hoàn thành → thêm dòng đốt mỡ (không tạ); bỏ tick → cập nhật đúng dòng; tiến độ đổi theo", async () => {
    const { user } = setup();
    await startToday(user);
    const plank = screen.getByRole("checkbox", { name: /Plank/ });

    await user.click(plank);
    expect(plank).toBeChecked();
    expect(screen.getByTestId("finisher-progress")).toHaveTextContent("Đã xong 1 / 4 bài");
    await waitFor(() =>
      expect(actions.addWorkoutSet).toHaveBeenCalledWith({ phase: "finisher", date: MONDAY, exerciseId: 31, completed: true, durationSec: null }),
    );

    await user.click(plank);
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 100, completed: false }));
    expect(plank).not.toBeChecked();
    expect(actions.addWorkoutSet).toHaveBeenCalledTimes(1); // không tạo dòng thứ 2
  });

  it("tick 2 lần thật nhanh khi lệnh thêm chưa xong → lệnh thứ 2 thành cập nhật (không tạo trùng)", async () => {
    const pending = deferred<Awaited<ReturnType<typeof actions.addWorkoutSet>>>();
    actions.addWorkoutSet.mockImplementationOnce(() => pending.promise);
    const { user } = setup();
    await startToday(user);
    const crunch = screen.getByRole("checkbox", { name: /Gập bụng/ });
    await user.click(crunch);
    await user.click(crunch);
    await act(async () =>
      pending.resolve({
        ok: true,
        data: {
          logId: LOG_ID,
          set: { id: 88, workoutLogId: LOG_ID, exerciseId: 32, phase: "finisher", setNumber: 1, reps: null, weight: null, durationSec: null, completed: true },
        },
      }),
    );
    await waitFor(() => expect(actions.updateWorkoutSet).toHaveBeenCalledWith({ id: 88, completed: false }));
    expect(actions.addWorkoutSet).toHaveBeenCalledTimes(1);
  });

  it("nhập thời gian → tự tick hoàn thành và lưu số giây; server lỗi → bỏ tick", async () => {
    const { user } = setup();
    await startToday(user);
    await user.type(screen.getByLabelText("Thời gian (giây) — Vung tạ ấm"), "45");
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /Vung tạ ấm/ })).toBeChecked();
    await waitFor(() =>
      expect(actions.addWorkoutSet).toHaveBeenCalledWith({ phase: "finisher", date: MONDAY, exerciseId: 30, completed: true, durationSec: 45 }),
    );

    actions.addWorkoutSet.mockResolvedValueOnce({ ok: false, error: "Mất kết nối" });
    await user.click(screen.getByRole("checkbox", { name: /Nâng hông/ }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Nâng hông/ })).not.toBeChecked());
    expect(finisherRow(/Nâng hông/)).toHaveAttribute("data-done", "false");
  });
});

// ---------- Modal hướng dẫn ----------

describe("WorkoutLogger — hướng dẫn bài tập", () => {
  it("bấm tên bài chính hoặc 'Cách tập' ở bài đốt mỡ → mở modal hướng dẫn", async () => {
    const { user } = setup();
    await startToday(user);
    await user.click(screen.getByRole("button", { name: "Xem hướng dẫn Romanian Deadlift (RDL)" }));
    const dialog = screen.getByRole("dialog", { name: "Romanian Deadlift (RDL)" });
    expect(within(dialog).getByText("Đẩy hông ra sau.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Xem hướng dẫn Kettlebell Swing" }));
    expect(screen.getByRole("dialog", { name: "Kettlebell Swing" })).toBeInTheDocument();
  });
});
