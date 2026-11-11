import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const exerciseCategoryEnum = pgEnum("exercise_category", ["gym", "yoga"]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const activityLevelEnum = pgEnum("activity_level", [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);

// ---------- Tables ----------

/**
 * users.id = Clerk userId (ví dụ "user_2abc..."), nên dùng text thay vì số tự tăng.
 * Chiều cao tính bằng cm, cân nặng tính bằng kg, BMR/TDEE tính bằng kcal/ngày.
 * sex + birth_year + activity_level cần cho công thức Mifflin-St Jeor (xem src/lib/energy.ts).
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  height: real("height"),
  weight: real("weight"),
  targetWeight: real("target_weight"),
  sex: sexEnum("sex"),
  birthYear: integer("birth_year"),
  activityLevel: activityLevelEnum("activity_level"),
  bmr: integer("bmr"),
  tdee: integer("tdee"),
  // Lịch tập tuần: mảng 7 template id, index = getDay() (0 = Chủ nhật). null = lịch mặc định.
  // Xem DEFAULT_WEEKLY_SCHEDULE / parseWeeklySchedule trong src/lib/workout-templates.ts
  weeklySchedule: jsonb("weekly_schedule").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    category: exerciseCategoryEnum("category").notNull(),
    muscleGroup: text("muscle_group"),
    instruction: text("instruction"),
    gifUrl: text("gif_url"),
    // Ghi nguồn ảnh (tác giả · giấy phép · nguồn) — bắt buộc với ảnh CC BY / CC BY-SA
    imageCredit: text("image_credit"),
    // Mức tạ khởi điểm gợi ý (văn bản tự do, ví dụ "20–30 kg") — xem src/lib/workout-templates.ts
    recommendedWeight: text("recommended_weight"),
    // Mẹo ngắn hiển thị ngay trên form nhập set
    tips: text("tips"),
  },
  (t) => [
    index("exercises_category_idx").on(t.category),
    // Tên là khoá tự nhiên để seed upsert idempotent
    uniqueIndex("exercises_name_uq").on(t.name),
  ],
);

export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    notes: text("notes"),
  },
  (t) => [index("workout_logs_user_date_idx").on(t.userId, t.date)],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    workoutLogId: integer("workout_log_id")
      .notNull()
      .references(() => workoutLogs.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    reps: integer("reps").notNull(),
    // kg; null = bài tập trọng lượng cơ thể
    weight: real("weight"),
    setNumber: integer("set_number").notNull(),
  },
  (t) => [
    index("workout_sets_log_idx").on(t.workoutLogId),
    uniqueIndex("workout_sets_log_exercise_set_uq").on(t.workoutLogId, t.exerciseId, t.setNumber),
  ],
);

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    totalCalories: integer("total_calories").notNull().default(0),
    yogaCompleted: boolean("yoga_completed").notNull().default(false),
    notes: text("notes"),
  },
  // Mỗi user chỉ có 1 daily log cho mỗi ngày
  (t) => [uniqueIndex("daily_logs_user_date_uq").on(t.userId, t.date)],
);

// ---------- Relations (cho db.query.* API) ----------

export const usersRelations = relations(users, ({ many }) => ({
  workoutLogs: many(workoutLogs),
  dailyLogs: many(dailyLogs),
}));

export const exercisesRelations = relations(exercises, ({ many }) => ({
  workoutSets: many(workoutSets),
}));

export const workoutLogsRelations = relations(workoutLogs, ({ one, many }) => ({
  user: one(users, { fields: [workoutLogs.userId], references: [users.id] }),
  sets: many(workoutSets),
}));

export const workoutSetsRelations = relations(workoutSets, ({ one }) => ({
  workoutLog: one(workoutLogs, { fields: [workoutSets.workoutLogId], references: [workoutLogs.id] }),
  exercise: one(exercises, { fields: [workoutSets.exerciseId], references: [exercises.id] }),
}));

export const dailyLogsRelations = relations(dailyLogs, ({ one }) => ({
  user: one(users, { fields: [dailyLogs.userId], references: [users.id] }),
}));

// ---------- Inferred types ----------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type NewWorkoutLog = typeof workoutLogs.$inferInsert;
export type WorkoutSet = typeof workoutSets.$inferSelect;
export type NewWorkoutSet = typeof workoutSets.$inferInsert;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type NewDailyLog = typeof dailyLogs.$inferInsert;
