# Architecture — Slimfit Tracker (Fitness & Nutrition App)

## Tech Stack

| Layer      | Công nghệ                         | Ghi chú                                              |
| ---------- | --------------------------------- | ---------------------------------------------------- |
| Framework  | **Next.js (App Router)**          | Server Components mặc định, Server Actions / Route Handlers cho API |
| Styling    | **Tailwind CSS**                  | Thiết kế **Mobile-first**: viết style cho mobile trước, mở rộng bằng `sm:` / `md:` / `lg:` |
| Database   | **Neon Serverless Postgres**      | Kết nối qua driver serverless (`@neondatabase/serverless`) |
| ORM        | **Drizzle ORM**                   | Schema định nghĩa bằng TypeScript, migration bằng `drizzle-kit` |
| Auth       | **Clerk**                         | Middleware bảo vệ route, `userId` của Clerk dùng làm khóa liên kết dữ liệu người dùng |

**Phiên bản đã cài:** Next.js 16.4.6, React 19.3, Tailwind CSS 4.3, drizzle-orm 0.45, drizzle-kit 0.31, @neondatabase/serverless 1.2.

> Next.js 16 có thay đổi API so với các bản cũ — tra `node_modules/next/dist/docs/` (xem `AGENTS.md`) trước khi viết code Next.

> Clerk v7 (Core 3): `SignedIn`/`SignedOut` đã bị xoá → dùng `<Show when="signed-in" | "signed-out">`. Next 16 bật Cache Components: component đọc auth/headers phải nằm trong `<Suspense>`.

## Auth & API

```
src/proxy.ts                     # clerkMiddleware — public: /, /sign-in, /sign-up; còn lại auth.protect()
src/lib/auth.ts                  # requireUserId(): lấy Clerk userId + upsert row users
src/lib/action-result.ts         # ActionResult<T> = { ok: true, data } | { ok: false, error, fieldErrors? }
src/db/queries/exercises.ts      # getExercises(filter) — đọc dữ liệu (Server Components)
src/app/api/exercises/route.ts   # GET /api/exercises?category=&muscleGroup=&search=
src/actions/workout-logs.ts      # createWorkoutLog, updateWorkoutLog, deleteWorkoutLog, saveWorkoutSets
src/actions/daily-logs.ts        # upsertDailyLog
src/actions/profile.ts           # updateProfile (tính + lưu bmr/tdee, refresh())
src/db/queries/dashboard.ts      # getDashboardData(userId, date): user + daily log hôm nay
src/lib/energy.ts                # Mifflin-St Jeor: calculateBmr, calculateTdee, calculateCalorieGoal (TDEE − 600)
src/lib/date.ts                  # todayInAppTz() — ngày theo giờ Asia/Ho_Chi_Minh; weekdayOf(date) = getDay() của chuỗi YYYY-MM-DD
src/app/page.tsx                 # Dashboard (landing nếu chưa đăng nhập)
src/components/dashboard/*       # ProfileCard/Form, CalorieIntakeCard, YogaHabitCard
src/components/ExerciseInfoModal.tsx # Modal hướng dẫn bài tập (<dialog>, bottom sheet trên mobile)
src/components/ExerciseMedia.tsx # Ảnh tĩnh minh hoạ trong modal: <img> khung 4:3, object-contain, skeleton + fallback
src/components/YogaLibrary.tsx   # Lưới tư thế yoga trên /workouts
src/db/seed/exercises.json       # Dữ liệu seed bài tập (ảnh ghép 2 tư thế Everkinetic / ảnh WGER / Wikimedia + imageCredit)
scripts/build-exercise-images.ts # npm run assets:images — 2 tư thế (Bắt đầu / Kết thúc) Everkinetic SVG hoặc cặp PNG wger → PNG 1200×900 vào public/exercises/steps/, cập nhật seed
scripts/seed-exercises.ts        # npm run db:seed — upsert exercises theo name
src/app/workouts/page.tsx        # Trang ghi chép tập luyện (tải bài gym trong <Suspense>)
src/components/WorkoutLogger.tsx # Client: gợi ý hôm nay, chọn ngày/bài tập, swap bài, nhập set (kèm tạ gợi ý), gọi actions workout-logs
src/components/workout/TodayWorkoutCard.tsx    # Khối "Gợi ý bài tập cho hôm nay (Thứ X)" + nút Bắt đầu / Xem lịch cả tuần
src/components/workout/WeeklyScheduleModal.tsx # Modal timeline Thứ 2 → CN, "Tập buổi này"
src/lib/workout-templates.ts     # WORKOUT_TEMPLATES (gym/yoga/rest), DEFAULT_WEEKLY_SCHEDULE, parseWeeklySchedule, templateForDay
src/lib/exercise-swap.ts         # findSwapAlternatives: bài cùng nhóm cơ chính (token đầu của muscle_group)
src/db/queries/schedule.ts       # getWeeklySchedule(userId): users.weekly_schedule hoặc lịch mặc định
```

UI luôn ở **dark mode** (`class="dark"` trên `<html>`, `@custom-variant dark` trong `globals.css`).

Quy ước:
- **Đọc** dữ liệu: hàm trong `src/db/queries/*` gọi trực tiếp từ Server Component; Route Handler `GET` khi client cần fetch.
- **Ghi** dữ liệu: Server Actions trong `src/actions/*`. Mỗi action: `requireUserId()` → validate bằng `zod` → query luôn kèm điều kiện `user_id = userId` → trả `ActionResult`.
- Thao tác nhiều câu lệnh cần atomic dùng `db.batch([...])` (neon-http không có `db.transaction()`).

## Scripts DB

| Script                | Tác dụng                                         |
| --------------------- | ------------------------------------------------ |
| `npm run db:generate` | Sinh file migration SQL từ `schema.ts`           |
| `npm run db:migrate`  | Áp migration lên Neon                            |
| `npm run db:push`     | Đẩy schema thẳng lên DB (chỉ dùng khi prototype) |
| `npm run db:studio`   | Mở Drizzle Studio xem dữ liệu                    |
| `npm run db:seed`     | Seed bảng `exercises` từ `src/db/seed/exercises.json` |
| `npm run assets:images` | Dựng lại ảnh ghép 2 tư thế từ Everkinetic / wger (cần mạng), rồi chạy `db:seed` |

## Testing

| Script            | Tác dụng                                  |
| ----------------- | ----------------------------------------- |
| `npm test`        | Vitest ở chế độ watch                     |
| `npm run test:run`| Chạy toàn bộ test 1 lần (dùng cho CI)     |

```
vitest.config.mts             # jsdom, plugin react + tsconfig paths, alias `server-only` → stub
vitest.setup.ts               # jest-dom matchers, cleanup, polyfill <dialog>
__tests__/utils.test.ts       # energy, date (weekdayOf), template ↔ seed, lịch tuần, swap
__tests__/components.test.tsx # Client Components (mock Server Actions)
__tests__/media.test.tsx      # ExerciseMedia (ảnh tĩnh, fallback), seed ↔ file trong public/ (PNG 1200×900, không GIF/video)
__tests__/actions.test.ts     # Server Actions (mock `@/db` dạng query-builder chainable, mock `requireUserId`, `next/cache`)
```

> Vitest chưa hỗ trợ **async Server Components** (`page.tsx` có `await`) → test các trang này bằng E2E.

## Nguyên tắc chung

- Ưu tiên Server Components; chỉ dùng `"use client"` khi cần tương tác/state.
- Mọi truy vấn DB đi qua Drizzle, không viết SQL thô trừ khi cần thiết.
- Biến môi trường (`DATABASE_URL`, `CLERK_*`) lưu trong `.env.local`, không commit.
- UI tối ưu cho màn hình điện thoại (touch target ≥ 44px, layout 1 cột mặc định).

## Cấu trúc thư mục DB

```
drizzle.config.ts      # cấu hình drizzle-kit (đọc DATABASE_URL từ .env.local)
drizzle/               # file migration SQL do drizzle-kit sinh ra
src/db/schema.ts       # định nghĩa bảng, enum, relations, type
src/db/index.ts        # export `db` (Drizzle + Neon HTTP driver)
```

> Driver `neon-http` không hỗ trợ interactive transaction. Nếu sau này cần `db.transaction()`, chuyển sang `drizzle-orm/neon-serverless` (WebSocket Pool).

## Database Schema

Đơn vị: chiều cao `cm`, cân nặng `kg`, năng lượng `kcal`. Cột `date` lưu kiểu `date` (chuỗi `YYYY-MM-DD`).

**Enum** `exercise_category`: `'gym' | 'yoga'` · `sex`: `'male' | 'female'` · `activity_level`: `'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'` (hệ số 1.2 / 1.375 / 1.55 / 1.725 / 1.9)

### `users`
| Cột           | Kiểu          | Ràng buộc                    |
| ------------- | ------------- | ---------------------------- |
| id            | text          | PK — Clerk `userId`          |
| height        | real          | nullable                     |
| weight        | real          | nullable                     |
| target_weight | real          | nullable                     |
| sex           | sex           | nullable                     |
| birth_year    | integer       | nullable                     |
| activity_level| activity_level| nullable                     |
| bmr           | integer       | nullable                     |
| tdee          | integer       | nullable                     |
| weekly_schedule | jsonb       | nullable — mảng 7 template id, index = `getDay()` (0 = CN); null = lịch mặc định |
| created_at    | timestamptz   | not null, default `now()`    |

### `exercises`
| Cột          | Kiểu              | Ràng buộc               |
| ------------ | ----------------- | ----------------------- |
| id           | integer identity  | PK                      |
| name         | text              | not null                |
| category     | exercise_category | not null (`gym`/`yoga`) |
| muscle_group | text              | nullable                |
| instruction  | text              | nullable                |
| gif_url      | text              | nullable (URL ảnh tĩnh, ngoài hoặc `/exercises/*`; tên cột giữ nguyên vì lý do lịch sử) |
| image_credit | text              | nullable (tác giả · nguồn · license) |
| recommended_weight | text        | nullable (mức tạ khởi điểm gợi ý, vd `20–30 kg`) |
| tips         | text              | nullable (mẹo ngắn hiện trên thẻ bài tập) |

Index: `category`. Unique: `name`.

### `workout_logs`
| Cột     | Kiểu             | Ràng buộc                                  |
| ------- | ---------------- | ------------------------------------------ |
| id      | integer identity | PK                                         |
| user_id | text             | not null, FK → `users.id` (cascade delete) |
| date    | date             | not null                                   |
| notes   | text             | nullable                                   |

Index: `(user_id, date)`.

### `workout_sets`
| Cột            | Kiểu             | Ràng buộc                                         |
| -------------- | ---------------- | ------------------------------------------------- |
| id             | integer identity | PK                                                |
| workout_log_id | integer          | not null, FK → `workout_logs.id` (cascade delete) |
| exercise_id    | integer          | not null, FK → `exercises.id` (restrict delete)   |
| reps           | integer          | not null                                          |
| weight         | real             | nullable (null = trọng lượng cơ thể)              |
| set_number     | integer          | not null                                          |

Index: `workout_log_id`. Unique: `(workout_log_id, exercise_id, set_number)`.

### `daily_logs`
| Cột            | Kiểu             | Ràng buộc                                  |
| -------------- | ---------------- | ------------------------------------------ |
| id             | integer identity | PK                                         |
| user_id        | text             | not null, FK → `users.id` (cascade delete) |
| date           | date             | not null                                   |
| total_calories | integer          | not null, default `0`                      |
| yoga_completed | boolean          | not null, default `false`                  |
| notes          | text             | nullable                                   |

Unique: `(user_id, date)` — mỗi user 1 bản ghi/ngày.

### Quan hệ
```
users 1─n workout_logs 1─n workout_sets n─1 exercises
users 1─n daily_logs
```
