import { Suspense } from "react";
import { connection } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { APP_TIME_ZONE, todayInAppTz } from "@/lib/date";
import { calculateCalorieGoal } from "@/lib/energy";
import { getDashboardData } from "@/db/queries/dashboard";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { NutritionTracker } from "@/components/nutrition/NutritionTracker";
import { HabitTracker } from "@/components/habits/HabitTracker";
import { TodayWorkoutWidget } from "@/components/dashboard/TodayWorkoutWidget";
import { parseWeeklySchedule } from "@/lib/workout-templates";

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

/** Đọc auth + DB + giờ hiện tại ở request time → phải nằm trong Suspense (Cache Components). */
async function Dashboard() {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  await connection(); // `new Date()` bên dưới cần request time, không được prerender
  const today = todayInAppTz();
  const { user, nutritionLogs, customFoods, habits } = await getDashboardData(userId, today);
  const calorieGoal = user?.tdee != null ? calculateCalorieGoal(user.tdee) : null;

  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date());

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header>
        <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan hôm nay</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Vòng tròn macro (trên cùng) + 4 thẻ bữa ăn */}
        {/* key={today}: qua ngày mới (router.refresh) thì state client khởi tạo lại từ dữ liệu ngày mới */}
        <NutritionTracker
          key={today}
          date={today}
          calorieGoal={calorieGoal}
          initialCustomFoods={customFoods}
          initialEntries={nutritionLogs.map(({ id, mealType, foodName, weightG, calories, proteinG, carbsG, fatG, fiberG }) => ({
            id,
            mealType,
            foodName,
            weightG,
            calories,
            proteinG,
            carbsG,
            fatG,
            fiberG,
          }))}
        />
        <DashboardWidget id="workout" icon="🏋️" title="Gợi ý bài tập hôm nay" emptyText="">
          <TodayWorkoutWidget today={today} schedule={parseWeeklySchedule(user?.weeklySchedule ?? null)} />
        </DashboardWidget>
        <DashboardWidget id="habits" icon="✅" title="Thói quen hôm nay" emptyText="">
          <HabitTracker key={today} date={today} initialHabits={habits} />
        </DashboardWidget>
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Slimfit Tracker</h1>
      <p className="max-w-sm text-muted-foreground">
        Theo dõi calo, TDEE, buổi tập gym và thói quen yoga mỗi ngày.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <SignUpButton>
          <button className="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground">Bắt đầu miễn phí</button>
        </SignUpButton>
        <SignInButton>
          <button className="h-14 rounded-xl border border-border text-lg font-medium text-foreground">Đăng nhập</button>
        </SignInButton>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-12 w-48 rounded-lg bg-card" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-44 rounded-2xl bg-card md:col-span-2" />
        <div className="h-72 rounded-2xl bg-card md:col-span-2" />
        <div className="h-36 rounded-2xl bg-card" />
        <div className="h-36 rounded-2xl bg-card" />
      </div>
    </div>
  );
}
