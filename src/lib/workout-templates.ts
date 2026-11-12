/**
 * Lịch tập mẫu (Workout Templates) + lịch tuần mặc định.
 * Template tham chiếu bài tập theo tên — khớp cột `exercises.name` (xem src/db/seed/exercises.json).
 * Mức tạ gợi ý của từng bài nằm trong DB (`recommended_weight`, `tips`).
 */
import { z } from "zod";

export type TemplateKind = "gym" | "yoga" | "rest";
export type WorkoutPhase = "main" | "finisher";

export type WorkoutTemplate = {
  id: string;
  name: string;
  focus: string;
  kind: TemplateKind;
  /** gym → Bài Tập Chính (tạ nặng, nghỉ lâu); yoga → tên tư thế yoga; rest → rỗng. */
  exerciseNames: string[];
  /** gym → chuỗi Đốt Mỡ Cuối Buổi (liên hoàn, 10–15 phút); yoga / rest → rỗng. */
  finisherNames: string[];
};

/** Tên hiển thị thuần Việt của 2 giai đoạn. */
export const PHASE_LABEL: Record<WorkoutPhase, string> = {
  main: "Bài Tập Chính",
  finisher: "Đốt Mỡ Cuối Buổi",
};

/** Cách tập từng giai đoạn — hiện dưới tiêu đề khu vực trên màn hình tập. */
export const PHASE_GUIDE: Record<WorkoutPhase, string> = {
  main: "Tạ nặng · 3–4 hiệp × 8–12 rep · nghỉ 90–120 giây giữa các hiệp",
  finisher: "Làm liên hoàn từng bài, hết chuỗi nghỉ 60 giây · lặp 2–3 vòng",
};

/**
 * Bài đốt mỡ: tên thuần Việt + mục tiêu mỗi vòng. Không nhập tạ — chỉ tick hoàn thành (hoặc ghi thời gian).
 * Bài không có trong bảng này vẫn dùng được (hiện tên gốc, không có mục tiêu).
 */
export const FINISHER_INFO: Record<string, { label: string; target: string }> = {
  "Kettlebell Swing": { label: "Vung tạ ấm", target: "15 lần" },
  Plank: { label: "Plank", target: "40 giây" },
  Crunch: { label: "Gập bụng", target: "15 lần" },
  "Glute Bridge": { label: "Nâng hông", target: "20 lần" },
  "Mountain Climber": { label: "Leo núi", target: "30 giây" },
  "Jumping Jack": { label: "Bật nhảy dang tay chân", target: "40 giây" },
  "Russian Twist": { label: "Xoay người", target: "20 lần" },
  "Dead Bug": { label: "Bọ chết", target: "10 lần mỗi bên" },
};

/** Cơ sở của mức tạ gợi ý + nguyên tắc chung. */
export const TEMPLATE_GUIDELINE = {
  basis: "Mức tạ khởi điểm cho nữ mới tập, BMI ~25–28",
  volume: "3–4 hiệp × 8–12 rep",
  progression: "Tăng 2–5 kg khi đã quen (Progressive Overload)",
};

/** Hiệp đầu tiên của một bài chính (các hiệp sau chép số của hiệp trước). */
export const DEFAULT_FIRST_SET = { reps: 10 };

/**
 * Mỗi buổi gym = Bài Tập Chính (3–4 bài nặng) + Đốt Mỡ Cuối Buổi (4 bài liên hoàn, 10–15 phút).
 * Bài phụ cô lập (Leg Curl, Kickback, Curl tay…) đã bỏ khỏi mẫu để buổi tập không quá dài khi thêm phần đốt mỡ;
 * vẫn thêm thủ công được.
 */
export const WORKOUT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: "lower-1",
    name: "Lower Body 1",
    focus: "Mông & Đùi sau",
    kind: "gym",
    exerciseNames: ["Hip Thrust", "Romanian Deadlift (RDL)", "Bulgarian Split Squat"],
    finisherNames: ["Kettlebell Swing", "Plank", "Crunch", "Glute Bridge"],
  },
  {
    id: "upper-a",
    name: "Upper Body A",
    focus: "Lưng xô, Ngực & Vai",
    kind: "gym",
    exerciseNames: ["Lat Pulldown", "Seated Cable Row", "Machine Chest Press", "Lateral Raise"],
    finisherNames: ["Mountain Climber", "Jumping Jack", "Russian Twist", "Plank"],
  },
  {
    id: "active-rest",
    name: "Active Rest / Yoga",
    focus: "Giãn cơ & hồi phục 15–20 phút",
    kind: "yoga",
    exerciseNames: ["Cat-Cow", "Downward Dog", "Child's Pose", "Pigeon Stretch", "Supine Figure Four", "Legs up the Wall"],
    finisherNames: [],
  },
  {
    id: "lower-2",
    name: "Lower Body 2",
    focus: "Mông & Đùi trước",
    kind: "gym",
    exerciseNames: ["Goblet Squat", "Leg Press", "Step-up", "Hip Abduction"],
    finisherNames: ["Kettlebell Swing", "Jumping Jack", "Dead Bug", "Glute Bridge"],
  },
  {
    id: "upper-b",
    name: "Upper Body B",
    focus: "Vai, Lưng trên & Ngực trên",
    kind: "gym",
    exerciseNames: ["Incline Dumbbell Press", "Dumbbell Shoulder Press", "One-arm Dumbbell Row", "Cable Face Pull"],
    finisherNames: ["Mountain Climber", "Crunch", "Russian Twist", "Plank"],
  },
  {
    id: "rest",
    name: "Nghỉ ngơi",
    focus: "Ngủ đủ, đi bộ nhẹ nếu muốn",
    kind: "rest",
    exerciseNames: [],
    finisherNames: [],
  },
];

/** Tên hiển thị của bài đốt mỡ (thuần Việt nếu có). */
export function finisherLabel(name: string): string {
  return FINISHER_INFO[name]?.label ?? name;
}

export const TEMPLATE_BY_ID = new Map(WORKOUT_TEMPLATES.map((t) => [t.id, t]));

/** Lịch tuần: 7 template id, index = Date#getDay() (0 = Chủ nhật … 6 = Thứ 7). */
export type WeeklySchedule = string[];

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = [
  "rest", // CN
  "lower-1", // T2
  "upper-a", // T3
  "active-rest", // T4
  "lower-2", // T5
  "upper-b", // T6
  "rest", // T7
];

/** Thứ tự hiển thị timeline: Thứ 2 → Chủ nhật. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayLabel(day: number): string {
  return day === 0 ? "Chủ nhật" : `Thứ ${day + 1}`;
}

/** 7 template id hợp lệ, index = getDay(). Dùng cả khi đọc DB lẫn validate action lưu lịch. */
export const weeklyScheduleSchema = z
  .array(z.string().refine((id) => TEMPLATE_BY_ID.has(id), "Buổi tập không hợp lệ."))
  .length(7);

/** Đọc `users.weekly_schedule` (jsonb). Dữ liệu null/sai định dạng → lịch mặc định. */
export function parseWeeklySchedule(value: unknown): WeeklySchedule {
  const parsed = weeklyScheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_WEEKLY_SCHEDULE;
}

export function templateForDay(schedule: WeeklySchedule, day: number): WorkoutTemplate {
  return TEMPLATE_BY_ID.get(schedule[day]) ?? TEMPLATE_BY_ID.get("rest")!;
}

/** Đếm số buổi theo loại — hiển thị tóm tắt "4 buổi gym · 1 yoga · 2 nghỉ". */
export function summarizeSchedule(schedule: WeeklySchedule): Record<TemplateKind, number> {
  const count: Record<TemplateKind, number> = { gym: 0, yoga: 0, rest: 0 };
  for (let day = 0; day < 7; day++) count[templateForDay(schedule, day).kind]++;
  return count;
}

export function sameSchedule(a: WeeklySchedule, b: WeeklySchedule): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
