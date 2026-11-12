import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { workoutLogs, workoutSets, dailyLogs, users, nutritionLogs, customFoods, habits, habitLogs, favoriteVideos } from "@/db/schema";
import {
  createWorkoutLog,
  deleteWorkoutLog,
  saveWorkoutSets,
  updateWorkoutLog,
} from "@/actions/workout-logs";
import { upsertDailyLog } from "@/actions/daily-logs";
import { updateProfile } from "@/actions/profile";
import { addNutritionLog, deleteNutritionLog } from "@/actions/nutrition-logs";
import { createHabit, deleteHabit, setHabitCompleted } from "@/actions/habits";
import { updateWeeklySchedule } from "@/actions/schedule";
import { addFavoriteVideo, deleteFavoriteVideo } from "@/actions/favorite-videos";

const { chain, db } = mocks;
const USER = "user_test_123";

beforeEach(() => {
  mocks.requireUserId.mockResolvedValue(USER);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ---------- workout-logs ----------

describe("createWorkoutLog", () => {
  it("chèn đúng userId / date / notes rồi trả về bản ghi", async () => {
    const row = { id: 1, userId: USER, date: "2026-11-11", notes: "Leg day" };
    const q = chain([row]);
    db.insert.mockReturnValue(q);

    const res = await createWorkoutLog({ date: "2026-11-11", notes: "  Leg day  " });

    expect(res).toEqual({ ok: true, data: row });
    expect(db.insert).toHaveBeenCalledWith(workoutLogs);
    // notes được trim; userId lấy từ session chứ không từ input
    expect(q.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-11", notes: "Leg day" });
    expect(q.returning).toHaveBeenCalled();
  });

  it("notes rỗng/undefined → lưu null", async () => {
    const q = chain([{ id: 2 }]);
    db.insert.mockReturnValue(q);

    await createWorkoutLog({ date: "2026-11-11" });

    expect(q.values).toHaveBeenCalledWith({ userId: USER, date: "2026-11-11", notes: null });
  });

  it.each(["11/11/2026", "2026-13-01", "", "not-a-date"])(
    "ngày không hợp lệ %j → lỗi validate, KHÔNG gọi DB",
    async (date) => {
      const res = await createWorkoutLog({ date });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Dữ liệu không hợp lệ.");
        expect(res.fieldErrors?.date).toBeDefined();
      }
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it("notes quá 1000 ký tự bị từ chối", async () => {
    const res = await createWorkoutLog({ date: "2026-11-11", notes: "x".repeat(1001) });
    expect(res.ok).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập → thông báo cần đăng nhập", async () => {
    mocks.requireUserId.mockRejectedValue(new mocks.UnauthorizedError());

    const res = await createWorkoutLog({ date: "2026-11-11" });

    expect(res).toEqual({ ok: false, error: "Bạn cần đăng nhập." });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("lỗi DB → thông báo chung, không lộ chi tiết", async () => {
    db.insert.mockReturnValue(chain([], new Error("connection reset")));

    const res = await createWorkoutLog({ date: "2026-11-11" });

    expect(res).toEqual({ ok: false, error: "Đã có lỗi xảy ra, vui lòng thử lại." });
  });
});

describe("updateWorkoutLog", () => {
  it("chỉ cập nhật field được gửi lên", async () => {
    const q = chain([{ id: 5, date: "2026-11-10", notes: null }]);
    db.update.mockReturnValue(q);

    const res = await updateWorkoutLog({ id: 5, date: "2026-11-10" });

    expect(res.ok).toBe(true);
    expect(db.update).toHaveBeenCalledWith(workoutLogs);
    expect(q.set).toHaveBeenCalledWith({ date: "2026-11-10" });
    expect(q.where).toHaveBeenCalledTimes(1);
  });

  it("không có gì để cập nhật → lỗi, không gọi DB", async () => {
    const res = await updateWorkoutLog({ id: 5 });
    expect(res).toEqual({ ok: false, error: "Không có gì để cập nhật." });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("không tìm thấy (hoặc không phải chủ sở hữu) → lỗi", async () => {
    db.update.mockReturnValue(chain([]));
    const res = await updateWorkoutLog({ id: 99, notes: "x" });
    expect(res).toEqual({ ok: false, error: "Không tìm thấy buổi tập." });
  });
});

describe("deleteWorkoutLog", () => {
  it("id không hợp lệ → không gọi DB", async () => {
    const res = await deleteWorkoutLog(-1);
    expect(res.ok).toBe(false);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("xoá thành công trả về id", async () => {
    db.delete.mockReturnValue(chain([{ id: 3 }]));
    const res = await deleteWorkoutLog(3);
    expect(res).toEqual({ ok: true, data: { id: 3 } });
    expect(db.delete).toHaveBeenCalledWith(workoutLogs);
  });
});

describe("saveWorkoutSets", () => {
  const ownsLog = () => db.select.mockReturnValueOnce(chain([{ id: 10 }]));

  it("buổi tập không thuộc user → lỗi, không ghi set", async () => {
    db.select.mockReturnValueOnce(chain([]));

    const res = await saveWorkoutSets({
      workoutLogId: 10,
      sets: [{ exerciseId: 1, setNumber: 1, reps: 10 }],
    });

    expect(res).toEqual({ ok: false, error: "Không tìm thấy buổi tập." });
    expect(db.batch).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("xoá set cũ + chèn set mới trong 1 batch, weight thiếu → null", async () => {
    ownsLog();
    const del = chain();
    const ins = chain();
    db.delete.mockReturnValue(del);
    db.insert.mockReturnValue(ins);
    const inserted = [{ id: 100 }, { id: 101 }];
    db.batch.mockResolvedValue([[], inserted]);

    const res = await saveWorkoutSets({
      workoutLogId: 10,
      sets: [
        { exerciseId: 1, setNumber: 1, reps: 12, weight: 40 },
        { exerciseId: 1, setNumber: 2, reps: 10 }, // bodyweight
      ],
    });

    expect(res).toEqual({ ok: true, data: inserted });
    expect(db.delete).toHaveBeenCalledWith(workoutSets);
    expect(db.insert).toHaveBeenCalledWith(workoutSets);
    expect(ins.values).toHaveBeenCalledWith([
      { workoutLogId: 10, exerciseId: 1, setNumber: 1, reps: 12, weight: 40 },
      { workoutLogId: 10, exerciseId: 1, setNumber: 2, reps: 10, weight: null },
    ]);
    expect(db.batch).toHaveBeenCalledWith([del, ins]);
  });

  it("danh sách rỗng → chỉ xoá, không insert", async () => {
    ownsLog();
    const del = chain();
    db.delete.mockReturnValue(del);

    const res = await saveWorkoutSets({ workoutLogId: 10, sets: [] });

    expect(res).toEqual({ ok: true, data: [] });
    expect(db.delete).toHaveBeenCalledWith(workoutSets);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it.each([
    ["reps âm", { exerciseId: 1, setNumber: 1, reps: -1 }],
    ["reps lẻ", { exerciseId: 1, setNumber: 1, reps: 8.5 }],
    ["tạ âm", { exerciseId: 1, setNumber: 1, reps: 8, weight: -5 }],
    ["setNumber = 0", { exerciseId: 1, setNumber: 0, reps: 8 }],
  ])("%s → lỗi validate, không chạm DB", async (_, set) => {
    const res = await saveWorkoutSets({ workoutLogId: 10, sets: [set] });
    expect(res.ok).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
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
      const q = chain([{ id: USER, bmr: 1299, tdee: 1786 }]);
      db.update.mockReturnValue(q);

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
