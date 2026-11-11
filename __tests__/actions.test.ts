import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { workoutLogs, workoutSets, dailyLogs, users } from "@/db/schema";
import {
  createWorkoutLog,
  deleteWorkoutLog,
  saveWorkoutSets,
  updateWorkoutLog,
} from "@/actions/workout-logs";
import { upsertDailyLog } from "@/actions/daily-logs";
import { updateProfile } from "@/actions/profile";

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
