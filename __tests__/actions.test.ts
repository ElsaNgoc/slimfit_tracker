import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// ---------- Mocks (hoisted trước khi import actions) ----------

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "UnauthorizedError";
    }
  }

  /**
   * Query builder giả của Drizzle: mọi method trả về chính nó (chainable),
   * `await` sẽ resolve ra `result`. Ghi lại tham số để assert.
   */
  function chain(result: unknown = [], failWith?: Error) {
    const c: Record<string, unknown> = {};
    for (const m of [
      "values",
      "returning",
      "set",
      "where",
      "from",
      "limit",
      "orderBy",
      "onConflictDoUpdate",
      "onConflictDoNothing",
    ]) {
      c[m] = vi.fn(() => c);
    }
    c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      (failWith ? Promise.reject(failWith) : Promise.resolve(result)).then(resolve, reject);
    return c as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
  }

  const db = {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    batch: vi.fn(),
  };

  return { UnauthorizedError, chain, db, requireUserId: vi.fn(), refresh: vi.fn() };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({
  requireUserId: mocks.requireUserId,
  UnauthorizedError: mocks.UnauthorizedError,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

import { workoutLogs, workoutSets, dailyLogs, users, nutritionLogs, customFoods, habits, habitLogs, favoriteVideos, weightLogs } from "@/db/schema";
import {
  addWorkoutSet,
  changeWorkoutExercise,
  deleteWorkoutSet,
  removeWorkoutExercise,
  saveWorkoutNotes,
  updateWorkoutSet,
} from "@/actions/workout-logs";
import { upsertDailyLog } from "@/actions/daily-logs";
import { updateProfile } from "@/actions/profile";
import { addNutritionLog, deleteNutritionLog } from "@/actions/nutrition-logs";
import { createHabit, deleteHabit, setHabitCompleted } from "@/actions/habits";
import { updateWeeklySchedule } from "@/actions/schedule";
import { addFavoriteVideo, deleteFavoriteVideo } from "@/actions/favorite-videos";
import { deleteCustomFood, updateCustomFood } from "@/actions/custom-foods";
import { upsertWeightLog } from "@/actions/weight-logs";

const { chain, db } = mocks;
const USER = "user_test_123";

beforeEach(() => {
  // clearMocks chỉ xoá lịch sử gọi, KHÔNG xoá mockResolvedValue / mockReturnValue → reset hẳn để test không
  // vô tình dùng giá trị trả về của test chạy trước (đã từng làm test updateProfile pass sai).
  for (const fn of Object.values(db)) fn.mockReset();
  mocks.requireUserId.mockReset().mockResolvedValue(USER);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------- workout-logs (auto-save) ----------

describe("workout-logs: auto-save từng thao tác", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z")); // 10h sáng 12/11 giờ VN
  });
  afterEach(() => vi.useRealTimers());

  const SET = { id: 55, workoutLogId: 7, exerciseId: 10, phase: "main", setNumber: 1, reps: 10, weight: 42.5, durationSec: null, completed: false };

  it("addWorkoutSet (chính): buổi tập đã có → chỉ INSERT set; set_number = max + 1 tính trong SQL", async () => {
    db.select.mockReturnValue(chain([{ id: 7 }]));
    const q = chain([SET]);
    db.insert.mockReturnValue(q);

    const res = await addWorkoutSet({ phase: "main", date: "2026-11-12", exerciseId: 10, reps: 10, weight: 42.5 });

    expect(res).toEqual({ ok: true, data: { logId: 7, set: SET } });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(workoutSets);
    const values = q.values.mock.calls[0][0];
    expect(values).toMatchObject({ workoutLogId: 7, exerciseId: 10, phase: "main", reps: 10, weight: 42.5 });
    const setNumber = new PgDialect().sqlToQuery(values.setNumber);
    expect(setNumber.sql).toMatch(/coalesce\(max\("workout_sets"."set_number"\), 0\) \+ 1/);
    expect(setNumber.params).toEqual([7, 10]);
    // Tìm buổi tập của đúng user + ngày
    const find = whereSql(db.select.mock.results[0].value);
    expect(find.sql).toContain('"workout_logs"."user_id" = $');
    expect(find.params).toEqual(expect.arrayContaining([USER, "2026-11-12"]));
  });

  it("addWorkoutSet: chưa có buổi tập của ngày → tạo workout_logs trước rồi mới ghi set", async () => {
    db.select.mockReturnValue(chain([]));
    const logQ = chain([{ id: 9 }]);
    const setQ = chain([{ ...SET, workoutLogId: 9 }]);
    db.insert.mockReturnValueOnce(logQ).mockReturnValueOnce(setQ);

    const res = await addWorkoutSet({ phase: "main", date: "2026-11-11", exerciseId: 10, reps: 8, weight: null });

    expect(res.ok && res.data.logId).toBe(9);
    expect(db.insert).toHaveBeenNthCalledWith(1, workoutLogs);
    expect(logQ.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-11" });
    expect(db.insert).toHaveBeenNthCalledWith(2, workoutSets);
    expect(setQ.values.mock.calls[0][0]).toMatchObject({ workoutLogId: 9, reps: 8, weight: null });
  });

  it("addWorkoutSet (đốt mỡ): không có rep / tạ, lưu hoàn thành + thời gian", async () => {
    db.select.mockReturnValue(chain([{ id: 7 }]));
    const q = chain([SET]);
    db.insert.mockReturnValue(q);
    await addWorkoutSet({ phase: "finisher", date: "2026-11-12", exerciseId: 31, completed: true, durationSec: 45 });
    const values = q.values.mock.calls[0][0];
    expect(values).toMatchObject({ workoutLogId: 7, exerciseId: 31, phase: "finisher", completed: true, durationSec: 45 });
    expect(values).not.toHaveProperty("reps");
    expect(values).not.toHaveProperty("weight");
  });

  it.each([
    ["ngày tương lai (giờ VN)", { phase: "main", date: "2026-11-13", exerciseId: 1, reps: 10, weight: null }, "Không thể ghi buổi tập cho ngày trong tương lai."],
    ["rep = 0", { phase: "main", date: "2026-11-12", exerciseId: 1, reps: 0, weight: null }, "Số rep phải từ 1 đến 1000."],
    ["tạ âm", { phase: "main", date: "2026-11-12", exerciseId: 1, reps: 10, weight: -5 }, "Mức tạ phải từ 0 đến 1000 kg."],
  ] as const)("addWorkoutSet: %s → lỗi tiếng Việt, không chạm DB", async (_, input, error) => {
    expect(await addWorkoutSet(input)).toEqual({ ok: false, error });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  /** Điều kiện sở hữu: WHERE chính có "workout_log_id in (subquery)", subquery lọc workout_logs theo user. */
  const expectOwnedByUser = (q: ReturnType<typeof chain>) => {
    // Subquery giả biên dịch thành tham số ("in $n"); chạy thật là "in (select id from workout_logs where user_id = …)"
    expect(whereSql(q).sql).toMatch(/"workout_sets"."workout_log_id" in \$\d/);
    expect(db.select).toHaveBeenCalledWith({ id: workoutLogs.id });
    const sub = whereSql(db.select.mock.results.at(-1)!.value);
    expect(sub.sql).toBe('"workout_logs"."user_id" = $1');
    expect(sub.params).toEqual([USER]);
  };

  it("updateWorkoutSet: chỉ ghi field được gửi, lọc theo buổi tập của user (subquery)", async () => {
    const q = chain([SET]);
    db.update.mockReturnValue(q);
    db.select.mockImplementation(() => chain());

    expect(await updateWorkoutSet({ id: 55, weight: 45 })).toEqual({ ok: true, data: SET });
    expect(db.update).toHaveBeenCalledWith(workoutSets);
    expect(q.set).toHaveBeenCalledWith({ weight: 45 });
    expect(whereSql(q).sql).toContain('"workout_sets"."id" = $');
    expect(whereSql(q).params[0]).toBe(55);
    expectOwnedByUser(q);
  });

  it("updateWorkoutSet: không tìm thấy (của người khác) / không có gì để sửa → lỗi", async () => {
    db.update.mockReturnValue(chain([]));
    db.select.mockImplementation(() => chain());
    expect(await updateWorkoutSet({ id: 99, completed: true })).toEqual({ ok: false, error: "Không tìm thấy hiệp tập." });
    db.update.mockClear();
    expect(await updateWorkoutSet({ id: 99 })).toEqual({ ok: false, error: "Không có gì để cập nhật." });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("deleteWorkoutSet: xoá kèm điều kiện sở hữu", async () => {
    const q = chain([{ id: 55 }]);
    db.delete.mockReturnValue(q);
    db.select.mockImplementation(() => chain());
    expect(await deleteWorkoutSet(55)).toEqual({ ok: true, data: { id: 55 } });
    expectOwnedByUser(q);
    db.delete.mockReturnValue(chain([]));
    expect(await deleteWorkoutSet(56)).toEqual({ ok: false, error: "Không tìm thấy hiệp tập." });
  });

  it("changeWorkoutExercise / removeWorkoutExercise: chỉ tác động bài đó trong buổi tập của user", async () => {
    db.select.mockImplementation(() => chain());
    const up = chain([{ id: 1 }, { id: 2 }]);
    db.update.mockReturnValue(up);
    expect(await changeWorkoutExercise({ logId: 7, fromExerciseId: 11, toExerciseId: 13 })).toEqual({ ok: true, data: { count: 2 } });
    expect(up.set).toHaveBeenCalledWith({ exerciseId: 13 });
    expect(whereSql(up).params.slice(0, 2)).toEqual([7, 11]);
    expectOwnedByUser(up);

    const del = chain([{ id: 1 }]);
    db.delete.mockReturnValue(del);
    expect(await removeWorkoutExercise({ logId: 7, exerciseId: 13 })).toEqual({ ok: true, data: { count: 1 } });
    expect(whereSql(del).sql).toContain('"workout_sets"."exercise_id" = $');
    expect(whereSql(del).params.slice(0, 2)).toEqual([7, 13]);
    expectOwnedByUser(del);
  });

  it("saveWorkoutNotes: tự tạo buổi tập nếu chưa có, ghi chú trống → null", async () => {
    db.select.mockReturnValue(chain([]));
    db.insert.mockReturnValue(chain([{ id: 12 }]));
    const up = chain();
    db.update.mockReturnValue(up);
    expect(await saveWorkoutNotes({ date: "2026-11-12", notes: "  Nghỉ 2 phút  " })).toEqual({ ok: true, data: { logId: 12 } });
    expect(up.set).toHaveBeenCalledWith({ notes: "Nghỉ 2 phút" });

    db.select.mockReturnValue(chain([{ id: 12 }]));
    await saveWorkoutNotes({ date: "2026-11-12", notes: "   " });
    expect(up.set).toHaveBeenLastCalledWith({ notes: null });
  });

  it("chưa đăng nhập → lỗi, không chạm DB", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());
    expect(await addWorkoutSet({ phase: "main", date: "2026-11-12", exerciseId: 1, reps: 10, weight: null })).toEqual({
      ok: false,
      error: "Bạn cần đăng nhập.",
    });
    expect(await deleteWorkoutSet(1)).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
    expect(db.select).not.toHaveBeenCalled();
  });
});

// ---------- daily-logs ----------

describe("upsertDailyLog", () => {
  it("chỉ yogaCompleted → upsert đúng field, không đụng total_calories", async () => {
    const q = chain([{ id: 1, yogaCompleted: true, totalCalories: 1200 }]);
    db.insert.mockReturnValue(q);

    const res = await upsertDailyLog({ date: "2026-11-11", yogaCompleted: true });

    expect(res.ok).toBe(true);
    expect(db.insert).toHaveBeenCalledWith(dailyLogs);
    expect(q.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-11", yogaCompleted: true });
    expect(q.onConflictDoUpdate).toHaveBeenCalledWith({
      target: [dailyLogs.userId, dailyLogs.date],
      set: { yogaCompleted: true },
    });
  });

  it("totalCalories hợp lệ được lưu", async () => {
    const q = chain([{ id: 1, totalCalories: 1500 }]);
    db.insert.mockReturnValue(q);

    await upsertDailyLog({ date: "2026-11-11", totalCalories: 1500 });

    expect(q.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: { totalCalories: 1500 } }),
    );
  });

  it.each([-1, 20001, 12.5])("totalCalories = %d bị từ chối", async (totalCalories) => {
    const res = await upsertDailyLog({ date: "2026-11-11", totalCalories });
    expect(res.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ---------- profile ----------

describe("updateProfile", () => {
  it("tính BMR/TDEE theo Mifflin-St Jeor rồi lưu + refresh()", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T05:00:00Z"));
    try {
      const q = chain();
      const wq = chain();
      db.update.mockReturnValue(q);
      db.insert.mockReturnValue(wq);
      db.batch.mockResolvedValue([[{ id: USER, bmr: 1299, tdee: 1786 }], []]);

      const res = await updateProfile({
        heightCm: 160,
        weightKg: 60,
        sex: "female",
        birthYear: 1998, // 28 tuổi năm 2026
        activityLevel: "light",
      });

      expect(res.ok).toBe(true);
      expect(db.update).toHaveBeenCalledWith(users);
      expect(q.set).toHaveBeenCalledWith({
        height: 160,
        weight: 60,
        targetWeight: null,
        sex: "female",
        birthYear: 1998,
        activityLevel: "light",
        bmr: 1299,
        tdee: 1786,
      });
      // Cùng batch: cân nặng ghi vào biểu đồ cho hôm nay (giờ VN), trùng ngày thì cập nhật
      expect(db.batch).toHaveBeenCalledWith([q, wq]);
      expect(db.insert).toHaveBeenCalledWith(weightLogs);
      expect(wq.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-11", weightKg: 60 });
      expect(wq.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ target: [weightLogs.userId, weightLogs.date] }),
      );
      expect(res).toEqual({ ok: true, data: { id: USER, bmr: 1299, tdee: 1786 } });
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dưới 13 tuổi bị từ chối", async () => {
    const res = await updateProfile({
      heightCm: 150,
      weightKg: 40,
      sex: "male",
      birthYear: new Date().getFullYear() - 5,
      activityLevel: "light",
    });
    expect(res.ok).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("chiều cao phi lý bị từ chối", async () => {
    const res = await updateProfile({
      heightCm: 20,
      weightKg: 60,
      sex: "female",
      birthYear: 1998,
      activityLevel: "light",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.heightCm).toBeDefined();
  });
});

// ---------- nutrition-logs ----------

describe("addNutritionLog", () => {
  const base = { date: "2026-11-12", mealType: "breakfast" as const };

  it("món từ tìm kiếm: lưu tên (gộp khoảng trắng), gram, calo, macro", async () => {
    const q = chain([{ id: 1 }]);
    db.insert.mockReturnValue(q);

    const res = await addNutritionLog({
      ...base,
      foodName: "  Thịt bò   nạc ",
      weightG: 150,
      calories: 375,
      proteinG: 39,
      carbsG: 0,
      fatG: 22.5,
    });

    expect(res.ok).toBe(true);
    expect(db.insert).toHaveBeenCalledWith(nutritionLogs);
    expect(q.values).toHaveBeenCalledWith({
      userId: USER,
      date: "2026-11-12",
      mealType: "breakfast",
      foodName: "Thịt bò nạc",
      weightG: 150,
      calories: 375,
      proteinG: 39,
      carbsG: 0,
      fatG: 22.5,
      fiberG: 0,
    });
  });

  it("tự nhập: chỉ tên + calo → gram = null, macro = 0", async () => {
    const q = chain([{ id: 2 }]);
    db.insert.mockReturnValue(q);

    await addNutritionLog({ ...base, mealType: "lunch", foodName: "Bún chả", calories: 600 });

    expect(q.values).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: "lunch", foodName: "Bún chả", weightG: null, calories: 600, proteinG: 0 }),
    );
  });

  it.each([
    ["thiếu tên", { calories: 100 }],
    ["tên chỉ có khoảng trắng", { foodName: "   ", calories: 100 }],
    ["tên quá dài", { foodName: "a".repeat(121), calories: 100 }],
    ["thiếu calo", { foodName: "Cơm" }],
    ["calo âm", { foodName: "Cơm", calories: -10 }],
    ["calo lẻ", { foodName: "Cơm", calories: 12.5 }],
    ["gram âm", { foodName: "Cơm", calories: 100, proteinG: -1 }],
    ["khối lượng 0", { foodName: "Cơm", calories: 100, weightG: 0 }],
    ["khối lượng quá lớn", { foodName: "Cơm", calories: 100, weightG: 5001 }],
  ])("%s → bị từ chối, không ghi DB", async (_, extra) => {
    // @ts-expect-error — kiểm tra validate runtime với input thiếu / sai
    const res = await addNutritionLog({ ...base, mealType: "snack", ...extra });
    expect(res.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("meal_type không hợp lệ → bị từ chối", async () => {
    // @ts-expect-error — kiểm tra validate runtime
    const res = await addNutritionLog({ ...base, mealType: "brunch", foodName: "Cơm", calories: 100 });
    expect(res.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("không tick lưu từ điển → chỉ 1 câu INSERT, không đụng custom_foods", async () => {
    db.insert.mockReturnValue(chain([{ id: 3 }]));
    const res = await addNutritionLog({ ...base, foodName: "Cơm", weightG: 200, calories: 260 });
    expect(res).toEqual({ ok: true, data: { log: { id: 3 }, customFood: null } });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("tick lưu từ điển → batch atomic: INSERT nutrition_logs + UPSERT custom_foods (quy về 100 g)", async () => {
    const logQ = chain();
    const foodQ = chain();
    db.insert.mockReturnValueOnce(logQ).mockReturnValueOnce(foodQ);
    db.batch.mockResolvedValue([[{ id: 10 }], [{ id: 20, name: "Bún chả" }]]);

    const res = await addNutritionLog({
      ...base,
      foodName: " Bún   CHẢ ",
      weightG: 250,
      calories: 500,
      proteinG: 25,
      carbsG: 60,
      fatG: 15,
      saveToDictionary: true,
    });

    expect(res).toEqual({ ok: true, data: { log: { id: 10 }, customFood: { id: 20, name: "Bún chả" } } });
    expect(db.batch).toHaveBeenCalledWith([logQ, foodQ]);
    expect(db.insert).toHaveBeenNthCalledWith(1, nutritionLogs);
    expect(db.insert).toHaveBeenNthCalledWith(2, customFoods);
    // Bữa ăn lưu đúng phần đã ăn; từ điển lưu số liệu / 100 g (500 kcal / 250 g → 200 kcal / 100 g)
    expect(logQ.values).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: "Bún CHẢ", weightG: 250, calories: 500, proteinG: 25 }),
    );
    expect(logQ.values.mock.calls[0][0]).not.toHaveProperty("saveToDictionary");
    expect(foodQ.values).toHaveBeenCalledWith({
      userId: USER,
      name: "Bún CHẢ",
      nameKey: "bún chả",
      calories: 200,
      proteinG: 10,
      carbsG: 24,
      fatG: 6,
    });
    // Trùng tên (user_id + name_key) → cập nhật số liệu thay vì tạo bản trùng
    expect(foodQ.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: [customFoods.userId, customFoods.nameKey] }),
    );
  });

  it("lưu từ điển nhưng thiếu khối lượng → lỗi tiếng Việt, không ghi DB", async () => {
    const res = await addNutritionLog({ ...base, foodName: "Bún chả", calories: 500, saveToDictionary: true });
    expect(res).toMatchObject({ ok: false, error: "Nhập khối lượng (gram) để lưu vào từ điển." });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("lưu từ điển với số liệu / 100 g vô lý (500 kcal trong 10 g) → từ chối", async () => {
    const res = await addNutritionLog({
      ...base,
      foodName: "Bánh",
      weightG: 10,
      calories: 500,
      saveToDictionary: true,
    });
    expect(res).toMatchObject({ ok: false, error: "Số liệu quy ra 100 g không hợp lý — kiểm tra lại khối lượng." });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập → lỗi, không ghi DB", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());
    const res = await addNutritionLog({ ...base, foodName: "Cơm", calories: 300 });
    expect(res).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("deleteNutritionLog", () => {
  it("xoá kèm điều kiện user_id", async () => {
    const q = chain([{ id: 7 }]);
    db.delete.mockReturnValue(q);

    const res = await deleteNutritionLog(7);

    expect(res).toEqual({ ok: true, data: { id: 7 } });
    expect(db.delete).toHaveBeenCalledWith(nutritionLogs);
    // Biên dịch điều kiện WHERE ra SQL thật để chắc chắn có lọc theo user (không xoá được bản ghi người khác)
    const { sql, params } = new PgDialect().sqlToQuery(q.where.mock.calls[0][0]);
    expect(sql).toContain('"nutrition_logs"."user_id" = $');
    expect(sql).toContain('"nutrition_logs"."id" = $');
    expect(params).toEqual(expect.arrayContaining([7, USER]));
  });

  it("bản ghi không thuộc user (0 dòng bị xoá) → lỗi", async () => {
    db.delete.mockReturnValue(chain([]));
    const res = await deleteNutritionLog(99);
    expect(res).toEqual({ ok: false, error: "Không tìm thấy bản ghi." });
  });
});

// ---------- habits ----------

/** Biên dịch mệnh đề WHERE (drizzle SQL) ra câu SQL + tham số để assert điều kiện lọc. */
const whereSql = (q: ReturnType<typeof chain>) =>
  new PgDialect().sqlToQuery(q.where.mock.calls[0][0] as Parameters<PgDialect["sqlToQuery"]>[0]);

describe("createHabit", () => {
  it("chuẩn hoá tên (gộp khoảng trắng) rồi chèn, bỏ qua nếu trùng", async () => {
    const q = chain([{ id: 1, userId: USER, name: "Lịch peel da HA", createdAt: new Date() }]);
    db.insert.mockReturnValue(q);

    const res = await createHabit({ name: "  Lịch   peel da HA " });

    expect(res.ok).toBe(true);
    expect(db.insert).toHaveBeenCalledWith(habits);
    expect(q.values).toHaveBeenCalledWith({ userId: USER, name: "Lịch peel da HA" });
    expect(q.onConflictDoNothing).toHaveBeenCalled();
  });

  it("trùng tên (DB không chèn, returning rỗng) → báo lỗi rõ ràng", async () => {
    db.insert.mockReturnValue(chain([]));
    const res = await createHabit({ name: "Skin care" });
    expect(res).toEqual({ ok: false, error: 'Đã có thói quen "Skin care".' });
  });

  it.each([
    ["rỗng", "   "],
    ["quá 60 ký tự", "a".repeat(61)],
  ])("tên %s → bị từ chối, không ghi DB", async (_, name) => {
    const res = await createHabit({ name });
    expect(res.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("deleteHabit", () => {
  it("xoá kèm điều kiện user_id", async () => {
    const q = chain([{ id: 4 }]);
    db.delete.mockReturnValue(q);

    expect(await deleteHabit(4)).toEqual({ ok: true, data: { id: 4 } });
    expect(db.delete).toHaveBeenCalledWith(habits);
    const { sql, params } = whereSql(q);
    expect(sql).toContain('"habits"."user_id" = $');
    expect(params).toEqual(expect.arrayContaining([4, USER]));
  });

  it("không thuộc user → lỗi", async () => {
    db.delete.mockReturnValue(chain([]));
    expect(await deleteHabit(4)).toEqual({ ok: false, error: "Không tìm thấy thói quen." });
  });
});

describe("setHabitCompleted", () => {
  it("thói quen của user → upsert theo (habit_id, date)", async () => {
    const owned = chain([{ id: 9 }]);
    db.select.mockReturnValue(owned);
    const q = chain([{ habitId: 9, date: "2026-11-12", completed: true }]);
    db.insert.mockReturnValue(q);

    const res = await setHabitCompleted({ habitId: 9, date: "2026-11-12", completed: true });

    expect(res).toEqual({ ok: true, data: { habitId: 9, date: "2026-11-12", completed: true } });
    const { sql, params } = whereSql(owned);
    expect(sql).toContain('"habits"."user_id" = $');
    expect(params).toEqual(expect.arrayContaining([9, USER]));
    expect(db.insert).toHaveBeenCalledWith(habitLogs);
    expect(q.values).toHaveBeenCalledWith({ habitId: 9, userId: USER, date: "2026-11-12", completed: true });
    expect(q.onConflictDoUpdate).toHaveBeenCalledWith({
      target: [habitLogs.habitId, habitLogs.date],
      set: { completed: true },
    });
  });

  it("thói quen của người khác → không ghi log", async () => {
    db.select.mockReturnValue(chain([]));
    const res = await setHabitCompleted({ habitId: 9, date: "2026-11-12", completed: true });
    expect(res).toEqual({ ok: false, error: "Không tìm thấy thói quen." });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("ngày sai định dạng → bị từ chối, không đụng DB", async () => {
    const res = await setHabitCompleted({ habitId: 9, date: "12/11/2026", completed: true });
    expect(res.ok).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });
});

// ---------- schedule ----------

describe("updateWeeklySchedule", () => {
  const VALID = ["rest", "lower-1", "lower-1", "active-rest", "upper-a", "upper-b", "rest"];

  it("lưu 7 template id vào users.weekly_schedule của chính user + refresh()", async () => {
    const q = chain([{ weeklySchedule: VALID }]);
    db.update.mockReturnValue(q);

    const res = await updateWeeklySchedule(VALID);

    expect(res).toEqual({ ok: true, data: VALID });
    expect(db.update).toHaveBeenCalledWith(users);
    expect(q.set).toHaveBeenCalledWith({ weeklySchedule: VALID });
    const { sql, params } = whereSql(q);
    expect(sql).toContain('"users"."id" = $');
    expect(params).toEqual([USER]);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it.each([
    ["thiếu ngày", VALID.slice(0, 6)],
    ["template không tồn tại", [...VALID.slice(0, 6), "leg-day"]],
  ])("%s → bị từ chối, không ghi DB", async (_, schedule) => {
    const res = await updateWeeklySchedule(schedule);
    expect(res.ok).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

// ---------- favorite-videos ----------

describe("addFavoriteVideo", () => {
  const oembed = (status: number, body: unknown = {}) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("link hợp lệ → hỏi YouTube oEmbed, lưu ID + tiêu đề + kênh của chính user", async () => {
    db.select.mockReturnValue(chain([]));
    const q = chain([{ id: 1, youtubeId: "v7AYKMP6rOE" }]);
    db.insert.mockReturnValue(q);
    const fetchSpy = oembed(200, { title: "Yoga For Complete Beginners", author_name: "Yoga With Adriene" });

    const res = await addFavoriteVideo({ url: "https://youtu.be/v7AYKMP6rOE?si=xyz" });

    expect(res.ok).toBe(true);
    const calledUrl = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(calledUrl.origin + calledUrl.pathname).toBe("https://www.youtube.com/oembed");
    expect(calledUrl.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=v7AYKMP6rOE");
    expect(db.insert).toHaveBeenCalledWith(favoriteVideos);
    expect(q.values).toHaveBeenCalledWith({
      userId: USER,
      youtubeId: "v7AYKMP6rOE",
      title: "Yoga For Complete Beginners",
      channel: "Yoga With Adriene",
    });
    expect(q.onConflictDoNothing).toHaveBeenCalled();
  });

  it.each([
    [401, "không cho phép phát trên trang khác"],
    [403, "không cho phép phát trên trang khác"],
    [404, "Không tìm thấy video"],
    [400, "Không tìm thấy video"],
  ])("oEmbed %d → báo lỗi, không lưu", async (status, msg) => {
    db.select.mockReturnValue(chain([]));
    oembed(status);
    const res = await addFavoriteVideo({ url: "https://www.youtube.com/watch?v=v7AYKMP6rOE" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(msg);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("mất mạng / YouTube không trả lời → báo lỗi thử lại, không lưu", async () => {
    db.select.mockReturnValue(chain([]));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const res = await addFavoriteVideo({ url: "https://youtu.be/v7AYKMP6rOE" });
    expect(res).toEqual({ ok: false, error: "Không kết nối được YouTube để kiểm tra video, vui lòng thử lại." });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("link không phải YouTube → báo lỗi, không gọi mạng / DB", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await addFavoriteVideo({ url: "https://vimeo.com/123" });
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("đã có trong danh sách → báo trùng, không gọi YouTube", async () => {
    db.select.mockReturnValue(chain([{ id: 3, youtubeId: "v7AYKMP6rOE" }]));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await addFavoriteVideo({ url: "https://youtu.be/v7AYKMP6rOE" });
    expect(res).toEqual({ ok: false, error: "Video này đã có trong danh sách yêu thích." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("đủ 50 video → chặn thêm", async () => {
    db.select.mockReturnValue(chain(Array.from({ length: 50 }, (_, i) => ({ id: i, youtubeId: `id${String(i).padStart(9, "0")}` }))));
    const res = await addFavoriteVideo({ url: "https://youtu.be/v7AYKMP6rOE" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("50 video");
  });

  it("chưa đăng nhập → lỗi", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());
    expect(await addFavoriteVideo({ url: "https://youtu.be/v7AYKMP6rOE" })).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
  });
});

describe("deleteFavoriteVideo", () => {
  it("xoá kèm điều kiện user_id", async () => {
    const q = chain([{ id: 5 }]);
    db.delete.mockReturnValue(q);
    expect(await deleteFavoriteVideo(5)).toEqual({ ok: true, data: { id: 5 } });
    expect(db.delete).toHaveBeenCalledWith(favoriteVideos);
    const { sql, params } = whereSql(q);
    expect(sql).toContain('"favorite_videos"."user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, USER]));
  });

  it("không thuộc user → lỗi", async () => {
    db.delete.mockReturnValue(chain([]));
    expect(await deleteFavoriteVideo(5)).toEqual({ ok: false, error: "Không tìm thấy video." });
  });
});

// ---------- custom-foods (từ điển riêng) ----------

describe("updateCustomFood", () => {
  const input = { id: 4, name: "  Bún chả   Hà Nội ", calories: 200, proteinG: 10, carbsG: 24, fatG: 6 };
  const saved = { id: 4, name: "Bún chả Hà Nội", calories: 200, proteinG: 10, carbsG: 24, fatG: 6 };

  it("chuẩn hoá tên, cập nhật name_key, lọc theo id + user_id, trả dòng mới", async () => {
    const clash = chain([]);
    const upd = chain([saved]);
    db.select.mockReturnValue(clash);
    db.update.mockReturnValue(upd);

    const res = await updateCustomFood(input);

    expect(res).toEqual({ ok: true, data: saved });
    expect(db.update).toHaveBeenCalledWith(customFoods);
    expect(upd.set).toHaveBeenCalledWith({
      name: "Bún chả Hà Nội",
      nameKey: "bún chả hà nội",
      calories: 200,
      proteinG: 10,
      carbsG: 24,
      fatG: 6,
    });
    const { sql, params } = whereSql(upd);
    expect(sql).toContain('"custom_foods"."user_id" = $');
    expect(sql).toContain('"custom_foods"."id" = $');
    expect(params).toEqual(expect.arrayContaining([4, USER]));
    // Kiểm tra trùng tên chỉ trong từ điển của chính user, loại trừ chính món đang sửa
    const check = whereSql(clash);
    expect(check.sql).toContain('"custom_foods"."user_id" = $');
    expect(check.sql).toContain('"custom_foods"."id" <> $');
    expect(check.params).toEqual(expect.arrayContaining([USER, "bún chả hà nội", 4]));
  });

  it("đổi sang tên đã có (khác hoa thường) → báo trùng, không UPDATE", async () => {
    db.select.mockReturnValue(chain([{ id: 9 }]));
    const res = await updateCustomFood({ ...input, name: "PHỞ BÒ" });
    expect(res).toMatchObject({ ok: false, error: "Từ điển đã có một món khác cùng tên." });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lỗi unique_violation từ DB (2 request đua nhau) → vẫn báo trùng tên", async () => {
    db.select.mockReturnValue(chain([]));
    db.update.mockReturnValue(chain([], Object.assign(new Error("db"), { cause: { code: "23505" } })));
    const res = await updateCustomFood(input);
    expect(res).toMatchObject({ ok: false, error: "Từ điển đã có một món khác cùng tên." });
  });

  it("món không thuộc user (0 dòng) → lỗi", async () => {
    db.select.mockReturnValue(chain([]));
    db.update.mockReturnValue(chain([]));
    expect(await updateCustomFood(input)).toEqual({ ok: false, error: "Không tìm thấy món này trong từ điển." });
  });

  it.each([
    ["tên trống", { name: "   " }],
    ["calo lẻ", { calories: 12.5 }],
    ["calo > 900 / 100 g", { calories: 901 }],
    ["macro âm", { fatG: -1 }],
    ["macro > 100 g", { carbsG: 101 }],
    ["tổng P + C + F > 100 g", { proteinG: 40, carbsG: 40, fatG: 30 }],
  ])("%s → từ chối, không đụng DB", async (_, extra) => {
    const res = await updateCustomFood({ ...input, ...extra });
    expect(res.ok).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("tổng macro vượt 100 g → thông báo cụ thể", async () => {
    const res = await updateCustomFood({ ...input, proteinG: 40, carbsG: 40, fatG: 30 });
    expect(res).toEqual({ ok: false, error: "Tổng Protein + Carbs + Fat không thể vượt 100 g / 100 g." });
  });

  it("chưa đăng nhập → lỗi", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());
    expect(await updateCustomFood(input)).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("deleteCustomFood", () => {
  it("xoá kèm điều kiện user_id", async () => {
    const q = chain([{ id: 4 }]);
    db.delete.mockReturnValue(q);
    expect(await deleteCustomFood(4)).toEqual({ ok: true, data: { id: 4 } });
    expect(db.delete).toHaveBeenCalledWith(customFoods);
    const { sql, params } = whereSql(q);
    expect(sql).toContain('"custom_foods"."user_id" = $');
    expect(sql).toContain('"custom_foods"."id" = $');
    expect(params).toEqual(expect.arrayContaining([4, USER]));
  });

  it("không thuộc user / id sai → lỗi, id không hợp lệ không chạm DB", async () => {
    db.delete.mockReturnValue(chain([]));
    expect(await deleteCustomFood(99)).toEqual({ ok: false, error: "Không tìm thấy món này trong từ điển." });
    db.delete.mockClear();
    expect((await deleteCustomFood(-1)).ok).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

// ---------- weight-logs (biểu đồ cân nặng) ----------

describe("upsertWeightLog", () => {
  const PROFILE = { id: USER, height: 160, sex: "female", birthYear: 1998, activityLevel: "light" };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z")); // 10h sáng 12/11 giờ VN
  });
  afterEach(() => vi.useRealTimers());

  it("ngày mới nhất → upsert log + đồng bộ users.weight và tính lại BMR / TDEE trong cùng batch", async () => {
    const wq = chain();
    const uq = chain();
    db.insert.mockReturnValue(wq);
    db.update.mockReturnValue(uq);
    db.select.mockImplementation(() => chain());
    db.batch.mockResolvedValueOnce([[PROFILE], [{ date: "2026-11-10" }]]).mockResolvedValueOnce([[], []]);

    const res = await upsertWeightLog({ date: "2026-11-12", weightKg: 61.26 });

    expect(res).toEqual({ ok: true, data: { date: "2026-11-12", weightKg: 61.3 } }); // làm tròn 1 chữ số
    expect(wq.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-12", weightKg: 61.3 });
    expect(wq.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ target: [weightLogs.userId, weightLogs.date] }));
    // 10·61.3 + 6.25·160 − 5·28 − 161 = 1312 · ×1.375 = 1804
    expect(uq.set).toHaveBeenCalledWith({ weight: 61.3, bmr: 1312, tdee: 1804 });
    expect(whereSql(uq).sql).toContain('"users"."id" = $');
    expect(db.batch).toHaveBeenLastCalledWith([wq, uq]);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("hồ sơ chưa đủ thông tin → vẫn đồng bộ users.weight, không tính BMR / TDEE", async () => {
    const uq = chain();
    db.insert.mockReturnValue(chain());
    db.update.mockReturnValue(uq);
    db.select.mockImplementation(() => chain());
    db.batch.mockResolvedValueOnce([[{ id: USER, height: null, sex: null, birthYear: null, activityLevel: null }], []]);
    db.batch.mockResolvedValueOnce([[], []]);

    expect((await upsertWeightLog({ date: "2026-11-01", weightKg: 64 })).ok).toBe(true);
    expect(uq.set).toHaveBeenCalledWith({ weight: 64 });
  });

  it("nhập bù ngày cũ (không phải mới nhất) → chỉ ghi log, không đụng users", async () => {
    const wq = chain();
    db.insert.mockReturnValue(wq);
    db.select.mockImplementation(() => chain());
    db.batch.mockResolvedValueOnce([[PROFILE], [{ date: "2026-11-12" }]]);

    expect((await upsertWeightLog({ date: "2026-11-05", weightKg: 63 })).ok).toBe(true);
    expect(wq.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-05", weightKg: 63 });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.batch).toHaveBeenCalledTimes(1); // chỉ batch đọc
  });

  it.each([
    ["ngày tương lai (giờ VN)", { date: "2026-11-13", weightKg: 60 }, "Không thể nhập cân nặng cho ngày trong tương lai."],
    ["quá nhẹ", { date: "2026-11-12", weightKg: 10 }, "Cân nặng từ 25 đến 350 kg."],
    ["quá nặng", { date: "2026-11-12", weightKg: 400 }, "Cân nặng từ 25 đến 350 kg."],
  ])("%s → lỗi tiếng Việt, không ghi DB", async (_, input, error) => {
    expect(await upsertWeightLog(input)).toEqual({ ok: false, error });
    expect(db.batch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập → lỗi", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());
    expect(await upsertWeightLog({ date: "2026-11-12", weightKg: 60 })).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
  });
});
