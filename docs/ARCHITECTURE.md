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
src/actions/favorite-videos.ts   # addFavoriteVideo (đọc ID từ link → kiểm tra YouTube oEmbed → lưu tiêu đề/kênh), deleteFavoriteVideo
src/db/queries/favorite-videos.ts # getFavoriteVideos(userId)
src/actions/schedule.ts          # updateWeeklySchedule (7 template id → users.weekly_schedule, refresh())
src/actions/habits.ts            # createHabit (trùng tên → lỗi), deleteHabit, setHabitCompleted (upsert habit_id + date, kiểm tra chủ sở hữu)
src/actions/nutrition-logs.ts    # addNutritionLog (tên món bắt buộc, gram tuỳ chọn; saveToDictionary → db.batch: INSERT nutrition_logs + UPSERT custom_foods quy về 100 g), deleteNutritionLog
src/lib/vietnameseFoods.ts       # Từ điển tĩnh: 106 thực phẩm Việt / 100 g (Tinh bột · Đạm · Sữa · Rau củ · Trái cây · Gia vị), có tên gọi khác vùng miền
src/lib/food-search.ts           # Từ điển động: gộp món có sẵn + custom_foods, searchFoods (bỏ dấu, alias, xếp hạng, món của tôi ưu tiên), scaleNutrients, per100FromPortion, foodNameKey
src/actions/profile.ts           # updateProfile (tính + lưu bmr/tdee, refresh())
src/db/queries/dashboard.ts      # getDashboardData(userId, date): user + daily log + nutrition_logs + custom_foods + habits (left join habit_logs của ngày) — 1 batch
src/db/queries/profile.ts        # getUserProfile(userId): row users
src/lib/nutrition.ts             # MEALS (Sáng 25% · Trưa 30% · Tối 30% · Phụ 15%), caloriesFromMacros (P/C 4, F 9 kcal/g), macroGoals (P 30% · C 40% · F 30%), mealCalorieTargets
src/lib/habits.ts                # BEAUTY_SUGGESTIONS (Gợi ý làm đẹp), normalizeHabitName, habitKey (so trùng không phân biệt hoa thường)
src/lib/use-day-rollover.ts      # Hook: qua nửa đêm giờ VN / quay lại tab hôm sau → router.refresh()
src/lib/use-animated-number.ts   # Hook số "nhảy" ease-out khi giá trị đổi (tôn trọng prefers-reduced-motion)
src/lib/energy.ts                # Mifflin-St Jeor: calculateBmr, calculateTdee, calculateCalorieGoal (TDEE − 600)
src/lib/date.ts                  # todayInAppTz() — ngày theo giờ Asia/Ho_Chi_Minh; weekdayOf(date) = getDay() của chuỗi YYYY-MM-DD
src/app/layout.tsx               # Navbar (header) + <main> + BottomNav
src/components/navbar.tsx        # Navbar: logo, tab ngang (≥ md), nút tài khoản; BottomNav: thanh tab đáy (< md). Chỉ hiện tab khi đã đăng nhập
src/components/navigation/TabNav.tsx # Client: NAV_TABS (Tổng quan / Tập luyện / Hồ sơ), usePathname → aria-current
src/app/page.tsx                 # Tab Tổng quan: Dinh dưỡng (vòng macro + 4 bữa), Gợi ý bài tập hôm nay, Thói quen hôm nay, Biểu đồ cân nặng (rỗng); landing nếu chưa đăng nhập. Tracker theo ngày đặt key={today}
src/components/dashboard/TodayWorkoutWidget.tsx # Server: thứ hôm nay (giờ VN) × lịch tuần → template, "Bắt đầu tập" (/workouts?start=today), "Đổi lịch" (/workouts?schedule=edit)
src/components/habits/HabitTracker.tsx       # Client: checkbox thói quen (optimistic), ô thêm, Gợi ý làm đẹp, xoá (confirm)
src/components/nutrition/NutritionTracker.tsx # Client: giữ state bản ghi trong ngày + từ điển riêng → MacroRings + 4 MealCard + AddFoodModal
src/components/nutrition/MacroRings.tsx       # 4 vòng tròn SVG Calories / Protein / Carbs / Fat (% so với mục tiêu)
src/components/nutrition/AddFoodModal.tsx     # <dialog> 2 tab: "Tìm món" (combobox tìm tại client trong từ điển gộp, ↑↓/Enter, chọn → gram + nút nhanh 50–200 g → macro tự nhân) và "Tự nhập" (tên + calo bắt buộc, khối lượng / P / C / F, checkbox "Lưu món này vào từ điển của tôi")
src/components/dashboard/DashboardWidget.tsx # Khung widget; không có children → placeholder rỗng
src/app/profile/page.tsx         # Tab Hồ sơ: thẻ TDEE / Mục tiêu calo + ProfileCard
src/components/profile/*         # ProfileCard (thu gọn khi đủ thông tin), ProfileForm (gọi updateProfile)
src/components/ExerciseInfoModal.tsx # Modal hướng dẫn bài tập (<dialog>, bottom sheet trên mobile)
src/components/ExerciseMedia.tsx # Ảnh tĩnh minh hoạ trong modal: <img> khung 4:3, object-contain, skeleton + fallback
src/components/yoga/YogaVideoLibrary.tsx # Thư viện video Yoga & Giãn cơ trên /workouts (#yoga-videos): "Video yêu thích của bạn" (dán link, xem trước, xoá) + "Gợi ý cho bạn"; card kiểu YouTube + modal <iframe> YouTube embed
src/lib/yoga-videos.ts           # YOGA_VIDEOS (5 video đã kiểm tra qua oEmbed), parseYoutubeId (watch / youtu.be / shorts / embed / live), youtubeEmbedUrl (youtube-nocookie), youtubeThumbnail, formatDuration
src/db/seed/exercises.json       # Dữ liệu seed bài tập (ảnh ghép 2 tư thế Everkinetic / ảnh WGER / Wikimedia + imageCredit)
scripts/build-exercise-images.ts # npm run assets:images — 2 tư thế (Bắt đầu / Kết thúc) Everkinetic SVG hoặc cặp PNG wger → PNG 1200×900 vào public/exercises/steps/, cập nhật seed
scripts/seed-exercises.ts        # npm run db:seed — upsert exercises theo name
src/app/workouts/page.tsx        # Trang ghi chép tập luyện (tải bài gym trong <Suspense>, thư viện video tĩnh ngoài Suspense); searchParams ?start=today → nạp sẵn bài hôm nay, ?schedule=edit → mở Cài đặt lịch tuần
src/components/WorkoutLogger.tsx # Client: gợi ý hôm nay, chọn ngày/bài tập, swap bài, nhập set (kèm tạ gợi ý), gọi actions workout-logs
src/components/workout/TodayWorkoutCard.tsx    # Khối "Gợi ý bài tập cho hôm nay (Thứ X)" + nút Bắt đầu / Xem lịch cả tuần
src/components/workout/WeeklyScheduleModal.tsx # Modal timeline Thứ 2 → CN, "Tập buổi này", nút "⚙️ Chỉnh lịch"
src/components/workout/ScheduleSettingsModal.tsx # Modal "Cài đặt lịch tuần": 7 <select> T2 → CN, đánh dấu "Đã đổi"/"Hôm nay", tóm tắt, Lịch mặc định, Lưu
src/lib/workout-templates.ts     # WORKOUT_TEMPLATES (gym/yoga/rest), DEFAULT_WEEKLY_SCHEDULE, weeklyScheduleSchema, parseWeeklySchedule, templateForDay, summarizeSchedule
src/lib/exercise-swap.ts         # findSwapAlternatives: bài cùng nhóm cơ chính (token đầu của muscle_group)
src/db/queries/schedule.ts       # getWeeklySchedule(userId): users.weekly_schedule hoặc lịch mặc định
```

UI luôn ở **dark mode** (`class="dark"` trên `<html>`, `@custom-variant dark` trong `globals.css`).

**Điều hướng:** mobile dùng bottom navigation cố định (`md:hidden`), desktop (≥ `md`) dùng tab ngang trong header. Biến CSS `--bottom-nav-h` (`globals.css`, = `4rem + safe-area` trên mobile, `0` từ `md`) dùng để chừa chỗ: `<main>` đệm đáy theo biến này, thanh cố định khác (vd. Save Workout) đặt `bottom-[var(--bottom-nav-h)]`. Thêm tab mới: thêm vào `NAV_TABS` (route mới mặc định được `proxy.ts` bảo vệ).

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
__tests__/yoga.test.tsx       # yoga-videos (dữ liệu, URL nhúng, parseYoutubeId) + YogaVideoLibrary (card, modal iframe, focus nút Đóng, video yêu thích)
__tests__/schedule.test.tsx   # Lịch tuần: lib, ScheduleSettingsModal, WorkoutLogger autoStart/openSettings, TodayWorkoutWidget
__tests__/habits.test.tsx     # lib/habits + HabitTracker (tick, thêm, gợi ý, xoá, reset qua ngày bằng fake timers)
__tests__/nutrition.test.tsx  # lib/nutrition + NutritionTracker (tìm món → gram → macro tự nhân, bàn phím, món của tôi, tự nhập + lưu từ điển, vòng tròn cập nhật, xoá/hoàn tác)
__tests__/food-dictionary.test.ts # vietnameseFoods (đủ nhóm, không trùng, calo ≈ Atwater), searchFoods (bỏ dấu, alias, xếp hạng, gộp món của tôi), quy đổi 100 g
__tests__/navigation.test.tsx # TabNav (tab active, responsive class), DashboardWidget
__tests__/media.test.tsx      # ExerciseMedia (ảnh tĩnh, fallback), seed ↔ file trong public/ (PNG 1200×900, không GIF/video)
__tests__/actions.test.ts     # Server Actions (mock `@/db` dạng query-builder chainable, mock `requireUserId`, `next/cache`)
```

> Vitest chưa hỗ trợ **async Server Components** (`page.tsx` có `await`) → test các trang này bằng E2E.

## Nguyên tắc chung

- Ưu tiên Server Components; chỉ dùng `"use client"` khi cần tương tác/state.
- Mọi truy vấn DB đi qua Drizzle, không viết SQL thô trừ khi cần thiết.
- Biến môi trường (`DATABASE_URL`, `CLERK_*`) lưu trong `.env.local`, không commit.
- Dinh dưỡng không gọi API ngoài: tìm món chạy hoàn toàn ở client trên từ điển tĩnh + `custom_foods` (tải sẵn cùng Dashboard).
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

**Enum** `exercise_category`: `'gym' | 'yoga'` · `meal_type`: `'breakfast' | 'lunch' | 'dinner' | 'snack'` (Sáng / Trưa / Tối / Phụ) · `sex`: `'male' | 'female'` · `activity_level`: `'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'` (hệ số 1.2 / 1.375 / 1.55 / 1.725 / 1.9)

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
| total_calories | integer          | not null, default `0` — **không còn dùng** (thay bằng `nutrition_logs`), giữ cột để không mất dữ liệu cũ |
| yoga_completed | boolean          | not null, default `false` — **không còn dùng** (thay bằng `habits` / `habit_logs`) |
| notes          | text             | nullable                                   |

Unique: `(user_id, date)` — mỗi user 1 bản ghi/ngày.

### `nutrition_logs`
| Cột        | Kiểu             | Ràng buộc                                  |
| ---------- | ---------------- | ------------------------------------------ |
| id         | integer identity | PK                                         |
| user_id    | text             | not null, FK → `users.id` (cascade delete) |
| date       | date             | not null                                   |
| meal_type  | meal_type        | not null                                   |
| food_name  | text             | not null, default `''` (bản ghi cũ trước 0008 có tên rỗng → UI hiện "Món chưa đặt tên") |
| weight_g   | real             | nullable (gram đã ăn khi chọn từ tìm kiếm; tự nhập = null) |
| calories   | integer          | not null                                   |
| protein_g  | real             | not null, default `0`                      |
| carbs_g    | real             | not null, default `0`                      |
| fat_g      | real             | not null, default `0`                      |
| fiber_g    | real             | not null, default `0` (không tính vào calo) |
| created_at | timestamptz      | not null, default `now()`                  |

Index: `(user_id, date)`. Mỗi lần bấm "+" = 1 dòng (nhiều dòng / bữa / ngày).

### `custom_foods`
| Cột        | Kiểu             | Ràng buộc                                  |
| ---------- | ---------------- | ------------------------------------------ |
| id         | integer identity | PK                                         |
| user_id    | text             | not null, FK → `users.id` (cascade delete) |
| name       | text             | not null (đã gộp khoảng trắng)             |
| name_key   | text             | not null — tên chữ thường, giữ dấu (`foodNameKey`: "Bơ" ≠ "Bò") |
| calories   | integer          | not null — kcal / 100 g                    |
| protein    | real             | not null, default `0` — g / 100 g          |
| carbs      | real             | not null, default `0` — g / 100 g          |
| fat        | real             | not null, default `0` — g / 100 g          |
| created_at | timestamptz      | not null, default `now()`                  |

Unique: `(user_id, name_key)` — lưu lại cùng tên thì `ON CONFLICT DO UPDATE` số liệu mới. Ghi cùng `nutrition_logs` trong 1 `db.batch` (atomic). Server từ chối số liệu quy ra 100 g vô lý (> 900 kcal hoặc P + C + F > 100 g).

### `habits`
| Cột        | Kiểu             | Ràng buộc                                  |
| ---------- | ---------------- | ------------------------------------------ |
| id         | integer identity | PK                                         |
| user_id    | text             | not null, FK → `users.id` (cascade delete) |
| name       | text             | not null (đã gộp khoảng trắng, ≤ 60 ký tự) |
| created_at | timestamptz      | not null, default `now()`                  |

Unique: `(user_id, lower(name))` — không trùng tên trong cùng user, không phân biệt hoa thường.

### `habit_logs`
| Cột       | Kiểu             | Ràng buộc                                    |
| --------- | ---------------- | -------------------------------------------- |
| id        | integer identity | PK                                           |
| habit_id  | integer          | not null, FK → `habits.id` (cascade delete)  |
| user_id   | text             | not null, FK → `users.id` (cascade delete)   |
| date      | date             | not null                                     |
| completed | boolean          | not null, default `false`                    |

Unique: `(habit_id, date)`. Index: `(user_id, date)`. Không có dòng cho ngày D = chưa check → **sang ngày mới mọi checkbox tự reset**, lịch sử ngày cũ vẫn giữ (dùng cho streak / thống kê sau này).

### `favorite_videos`
| Cột        | Kiểu             | Ràng buộc                                  |
| ---------- | ---------------- | ------------------------------------------ |
| id         | integer identity | PK                                         |
| user_id    | text             | not null, FK → `users.id` (cascade delete) |
| youtube_id | text             | not null (11 ký tự)                        |
| title      | text             | not null (lấy từ YouTube oEmbed lúc lưu)   |
| channel    | text             | nullable                                   |
| created_at | timestamptz      | not null, default `now()`                  |

Unique: `(user_id, youtube_id)`. Thumbnail / link nhúng suy ra từ `youtube_id`. Tối đa 50 video / user (kiểm tra trong action).

### Quan hệ
```
users 1─n workout_logs 1─n workout_sets n─1 exercises
users 1─n daily_logs
users 1─n nutrition_logs
users 1─n custom_foods
users 1─n habits 1─n habit_logs
users 1─n favorite_videos
```
