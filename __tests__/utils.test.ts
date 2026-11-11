import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LEVELS,
  CALORIE_DEFICIT,
  ageFromBirthYear,
  calculateBmr,
  calculateCalorieGoal,
  calculateTdee,
  type ActivityLevel,
} from "@/lib/energy";
import { currentYearInAppTz, formatDayMonth, todayInAppTz, weekdayOf } from "@/lib/date";
import {
  DEFAULT_WEEKLY_SCHEDULE,
  WEEK_ORDER,
  WORKOUT_TEMPLATES,
  parseWeeklySchedule,
  templateForDay,
  weekdayLabel,
} from "@/lib/workout-templates";
import { MAX_SWAP_OPTIONS, findSwapAlternatives, muscleTokens } from "@/lib/exercise-swap";
import seed from "@/db/seed/exercises.json";

describe("calculateBmr (Mifflin-St Jeor)", () => {
  // Giá trị kỳ vọng tính tay: 10·kg + 6.25·cm − 5·tuổi (+5 nam / −161 nữ)
  it.each([
    { sex: "male", weightKg: 80, heightCm: 180, age: 30, expected: 1780 }, // 800 + 1125 − 150 + 5
    { sex: "female", weightKg: 60, heightCm: 160, age: 28, expected: 1299 }, // 600 + 1000 − 140 − 161
    { sex: "female", weightKg: 55, heightCm: 155, age: 22, expected: 1248 }, // 550 + 968.75 − 110 − 161 = 1247.75 → 1248
  ] as const)("$sex $weightKg kg / $heightCm cm / $age tuổi → $expected kcal", (input) => {
    const { expected, ...rest } = input;
    expect(calculateBmr(rest)).toBe(expected);
  });

  it("chênh lệch nam/nữ cùng chỉ số luôn là 166 kcal", () => {
    const base = { weightKg: 70, heightCm: 170, age: 35 };
    expect(calculateBmr({ ...base, sex: "male" }) - calculateBmr({ ...base, sex: "female" })).toBe(166);
  });

  it("làm tròn về số nguyên", () => {
    // 10·65.5 + 6.25·163 − 5·40 − 161 = 655 + 1018.75 − 200 − 161 = 1312.75
    expect(calculateBmr({ weightKg: 65.5, heightCm: 163, age: 40, sex: "female" })).toBe(1313);
  });

  it("tăng cân → BMR tăng, tăng tuổi → BMR giảm", () => {
    const base = { weightKg: 70, heightCm: 170, age: 30, sex: "male" } as const;
    expect(calculateBmr({ ...base, weightKg: 80 })).toBeGreaterThan(calculateBmr(base));
    expect(calculateBmr({ ...base, age: 50 })).toBeLessThan(calculateBmr(base));
  });
});

describe("calculateTdee", () => {
  it.each(Object.entries(ACTIVITY_LEVELS) as [ActivityLevel, { factor: number }][])(
    "%s nhân đúng hệ số",
    (level, { factor }) => {
      expect(calculateTdee(1500, level)).toBe(Math.round(1500 * factor));
    },
  );

  it("ví dụ cụ thể: BMR 1780 × 1.55 = 2759", () => {
    expect(calculateTdee(1780, "moderate")).toBe(2759);
  });

  it("hệ số vận động tăng dần theo mức độ", () => {
    const factors = Object.values(ACTIVITY_LEVELS).map((a) => a.factor);
    expect(factors).toEqual([...factors].sort((a, b) => a - b));
  });
});

describe("calculateCalorieGoal", () => {
  it(`= TDEE − ${CALORIE_DEFICIT}`, () => {
    expect(CALORIE_DEFICIT).toBe(600);
    expect(calculateCalorieGoal(2000)).toBe(1400);
  });

  it("không bao giờ âm", () => {
    expect(calculateCalorieGoal(500)).toBe(0);
  });

  it("pipeline đầy đủ: nữ 60 kg / 160 cm / 28 tuổi / vận động nhẹ", () => {
    const bmr = calculateBmr({ weightKg: 60, heightCm: 160, age: 28, sex: "female" });
    const tdee = calculateTdee(bmr, "light");
    expect([bmr, tdee, calculateCalorieGoal(tdee)]).toEqual([1299, 1786, 1186]);
  });
});

describe("ageFromBirthYear", () => {
  it("tính theo năm hiện tại", () => {
    expect(ageFromBirthYear(1998, new Date("2026-11-11T00:00:00Z"))).toBe(28);
  });
});

describe("todayInAppTz / currentYearInAppTz (Asia/Ho_Chi_Minh, UTC+7)", () => {
  it("trả về YYYY-MM-DD", () => {
    expect(todayInAppTz(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-11");
  });

  it("sau 17:00 UTC đã sang ngày mới ở Việt Nam", () => {
    expect(todayInAppTz(new Date("2026-11-11T16:59:00Z"))).toBe("2026-11-11");
    expect(todayInAppTz(new Date("2026-11-11T17:00:00Z"))).toBe("2026-11-12");
  });

  it("giao thừa: năm mới ở VN sớm hơn UTC 7 tiếng", () => {
    expect(currentYearInAppTz(new Date("2026-12-31T17:30:00Z"))).toBe(2027);
  });
});

// ---------- Lịch tập mẫu ↔ seed ----------

describe("WORKOUT_TEMPLATES", () => {
  const byName = new Map(seed.exercises.map((e) => [e.name, e]));

  it.each(WORKOUT_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s: mọi bài đều có trong seed, đúng loại, bài gym có mức tạ gợi ý",
    (_, t) => {
      expect(new Set(t.exerciseNames).size).toBe(t.exerciseNames.length);
      if (t.kind === "rest") expect(t.exerciseNames).toEqual([]);
      for (const name of t.exerciseNames) {
        const e = byName.get(name);
        expect(e, `thiếu "${name}" trong exercises.json`).toBeDefined();
        expect(e!.category).toBe(t.kind);
        if (t.kind === "gym") expect(e!.recommendedWeight).toBeTruthy();
      }
    },
  );

  it("id template là duy nhất", () => {
    expect(new Set(WORKOUT_TEMPLATES.map((t) => t.id)).size).toBe(WORKOUT_TEMPLATES.length);
  });

  it("tên bài tập trong seed là duy nhất", () => {
    expect(byName.size).toBe(seed.exercises.length);
  });
});

describe("Lịch tuần mặc định", () => {
  it("T2 Lower 1 · T3 Upper A · T4 Yoga · T5 Lower 2 · T6 Upper B · T7/CN nghỉ", () => {
    const names = [0, 1, 2, 3, 4, 5, 6].map((d) => templateForDay(DEFAULT_WEEKLY_SCHEDULE, d).name);
    expect(names).toEqual([
      "Nghỉ ngơi",
      "Lower Body 1",
      "Upper Body A",
      "Active Rest / Yoga",
      "Lower Body 2",
      "Upper Body B",
      "Nghỉ ngơi",
    ]);
  });

  it("weekdayLabel / WEEK_ORDER", () => {
    expect(WEEK_ORDER.map(weekdayLabel)).toEqual([
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ]);
  });

  it.each([
    ["null", null],
    ["không phải mảng", { mon: "lower-1" }],
    ["thiếu ngày", ["rest", "lower-1"]],
    ["id lạ", ["rest", "lower-1", "upper-a", "active-rest", "lower-2", "upper-b", "crossfit"]],
  ])("parseWeeklySchedule(%s) → lịch mặc định", (_, value) => {
    expect(parseWeeklySchedule(value)).toBe(DEFAULT_WEEKLY_SCHEDULE);
  });

  it("parseWeeklySchedule giữ lịch hợp lệ của user", () => {
    const custom = ["rest", "upper-b", "upper-a", "active-rest", "lower-2", "lower-1", "rest"];
    expect(parseWeeklySchedule(custom)).toEqual(custom);
  });
});

describe("weekdayOf / formatDayMonth", () => {
  it.each([
    ["2026-11-09", 1],
    ["2026-11-11", 3],
    ["2026-11-14", 6],
    ["2026-11-15", 0],
    ["2024-02-29", 4],
  ])("%s → getDay() = %i", (date, day) => {
    expect(weekdayOf(date)).toBe(day);
  });

  it("formatDayMonth", () => {
    expect(formatDayMonth("2026-11-09")).toBe("09/11");
  });
});

// ---------- Swap Exercise ----------

describe("findSwapAlternatives", () => {
  const gym = seed.exercises
    .filter((e) => e.category === "gym")
    .map((e, i) => ({ ...e, id: i + 1 }));
  const get = (name: string) => gym.find((e) => e.name === name)!;
  const names = (name: string, exclude: string[] = []) =>
    findSwapAlternatives(get(name), gym, new Set(exclude.map((n) => get(n).id))).map((e) => e.name);

  it("muscleTokens bỏ ngoặc + viết thường", () => {
    expect(muscleTokens("Mông nhỡ (mông bên), Hông")).toEqual(["mông nhỡ", "hông"]);
    expect(muscleTokens(null)).toEqual([]);
  });

  it("Barbell Squat → các bài Đùi trước (Goblet Squat, Leg Press…)", () => {
    const alt = names("Barbell Squat");
    expect(alt).toContain("Goblet Squat");
    expect(alt).toContain("Leg Press");
    expect(alt).not.toContain("Barbell Squat");
    expect(alt.length).toBeLessThanOrEqual(MAX_SWAP_OPTIONS);
  });

  it("ưu tiên cùng nhóm chính, không lẫn bài chỉ trùng nhóm phụ", () => {
    expect(names("Lat Pulldown")).toEqual(["One-arm Dumbbell Row", "Seated Cable Row"]);
    expect(names("Bicep Curl")).toEqual(["Hammer Curl"]);
    expect(names("Bench Press")).not.toContain("Tricep Extension");
  });

  it("không có bài cùng nhóm chính → dùng bài tác động phụ", () => {
    expect(names("Plank")).toEqual(["Barbell Squat", "Push-up"]);
  });

  it("loại bài đã có trong buổi tập; không lấy yoga", () => {
    expect(names("Hip Thrust", ["Cable Kickback"])).toEqual(["Glute Bridge"]);
    const yoga = { id: 999, name: "Pigeon Stretch", category: "yoga", muscleGroup: "Mông, Hông" };
    expect(findSwapAlternatives(get("Hip Thrust"), [...gym, yoga]).map((e) => e.name)).not.toContain(
      "Pigeon Stretch",
    );
  });

  it("mọi bài trong lịch tập gym đều có ít nhất 1 bài thay thế", () => {
    for (const t of WORKOUT_TEMPLATES.filter((t) => t.kind === "gym"))
      for (const n of t.exerciseNames) expect(names(n), n).not.toHaveLength(0);
  });
});
