import { relations, sql } from "drizzle-orm";
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
// Bữa ăn: Sáng / Trưa / Tối / Phụ — nhãn + tỉ lệ chia calo xem src/lib/nutrition.ts
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);

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

/**
 * Nhật ký dinh dưỡng: mỗi lần bấm "+" ở 1 bữa = 1 dòng (1 user có nhiều dòng / bữa / ngày).
 * calories luôn có giá trị (nhập trực tiếp hoặc quy đổi từ macro: P/C 4 kcal/g, F 9 kcal/g);
 * macro mặc định 0 khi chỉ nhập tổng calo.
 */
export const nutritionLogs = pgTable(
  "nutrition_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    mealType: mealTypeEnum("meal_type").notNull(),
    // Tên món (từ từ điển hoặc tự gõ). Default '' chỉ để điền cho bản ghi cũ trước khi có cột này.
    foodName: text("food_name").notNull().default(""),
    // Khối lượng đã ăn (gram). null = nhập thủ công không ghi khối lượng.
    weightG: real("weight_g"),
    calories: integer("calories").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    fiberG: real("fiber_g").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("nutrition_logs_user_date_idx").on(t.userId, t.date)],
);

/**
 * Từ điển món ăn riêng của user ("Lưu món này vào từ điển của tôi"). Mọi chỉ số tính trên 100 g.
 * Tìm kiếm gộp với từ điển tĩnh src/lib/vietnameseFoods.ts.
 * name_key = tên chữ thường, giữ dấu (xem foodNameKey) → lưu lại cùng tên thì cập nhật số liệu thay vì tạo bản trùng.
 */
export const customFoods = pgTable(
  "custom_foods",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    calories: integer("calories").notNull(),
    proteinG: real("protein").notNull().default(0),
    carbsG: real("carbs").notNull().default(0),
    fatG: real("fat").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("custom_foods_user_name_uq").on(t.userId, t.nameKey)],
);

/** Thói quen do user tự tạo (Skin care, Đắp mặt nạ…). Tên không trùng (không phân biệt hoa thường) trong cùng user. */
export const habits = pgTable(
  "habits",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("habits_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

/**
 * Trạng thái check của 1 thói quen trong 1 ngày. Không có dòng cho ngày D = chưa check
 * → sang ngày mới mọi checkbox tự về trạng thái chưa hoàn thành, lịch sử các ngày cũ vẫn giữ.
 */
export const habitLogs = pgTable(
  "habit_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    // Lặp lại user_id để mọi query lọc thẳng theo user (không cần join habits)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    completed: boolean("completed").notNull().default(false),
  },
  (t) => [
    uniqueIndex("habit_logs_habit_date_uq").on(t.habitId, t.date),
    index("habit_logs_user_date_idx").on(t.userId, t.date),
  ],
);

/**
 * Video YouTube giãn cơ / yoga user tự lưu (dán link). Chỉ lưu ID + tiêu đề / kênh lấy từ YouTube oEmbed lúc lưu;
 * thumbnail và link nhúng suy ra từ ID (xem src/lib/yoga-videos.ts). Mỗi video chỉ lưu 1 lần / user.
 */
export const favoriteVideos = pgTable(
  "favorite_videos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    youtubeId: text("youtube_id").notNull(),
    title: text("title").notNull(),
    channel: text("channel"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("favorite_videos_user_video_uq").on(t.userId, t.youtubeId)],
);

// ---------- Relations (cho db.query.* API) ----------

export const usersRelations = relations(users, ({ many }) => ({
  workoutLogs: many(workoutLogs),
  dailyLogs: many(dailyLogs),
  nutritionLogs: many(nutritionLogs),
  customFoods: many(customFoods),
  habits: many(habits),
  favoriteVideos: many(favoriteVideos),
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

export const nutritionLogsRelations = relations(nutritionLogs, ({ one }) => ({
  user: one(users, { fields: [nutritionLogs.userId], references: [users.id] }),
}));

export const customFoodsRelations = relations(customFoods, ({ one }) => ({
  user: one(users, { fields: [customFoods.userId], references: [users.id] }),
}));

export const habitsRelations = relations(habits, ({ one, many }) => ({
  user: one(users, { fields: [habits.userId], references: [users.id] }),
  logs: many(habitLogs),
}));

export const habitLogsRelations = relations(habitLogs, ({ one }) => ({
  habit: one(habits, { fields: [habitLogs.habitId], references: [habits.id] }),
}));

export const favoriteVideosRelations = relations(favoriteVideos, ({ one }) => ({
  user: one(users, { fields: [favoriteVideos.userId], references: [users.id] }),
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
export type NutritionLog = typeof nutritionLogs.$inferSelect;
export type NewNutritionLog = typeof nutritionLogs.$inferInsert;
export type CustomFood = typeof customFoods.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type HabitLog = typeof habitLogs.$inferSelect;
export type FavoriteVideo = typeof favoriteVideos.$inferSelect;
