import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { getDashboardData } from "@/db/queries/dashboard";
import { APP_TIME_ZONE, todayInAppTz } from "@/lib/date";
import { CALORIE_DEFICIT, calculateCalorieGoal } from "@/lib/energy";
import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { CalorieIntakeCard } from "@/components/dashboard/CalorieIntakeCard";
import { YogaHabitCard } from "@/components/dashboard/YogaHabitCard";

export default function HomePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

/** Đọc auth + DB ở request time → phải nằm trong Suspense (Cache Components). */
async function Dashboard() {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  const today = todayInAppTz();
  const { user, dailyLog } = await getDashboardData(userId, today);

  const tdee = user?.tdee ?? null;
  const calorieGoal = tdee !== null ? calculateCalorieGoal(tdee) : null;
  const profileComplete = Boolean(
    user?.height && user.weight && user.sex && user.birthYear && user.activityLevel,
  );

  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date());

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header>
        <p className="text-sm text-zinc-500 capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan hôm nay</h1>
      </header>

      {/* TDEE & mục tiêu calo */}
      {tdee !== null && calorieGoal !== null ? (
        <section className="grid grid-cols-2 gap-3">
          <StatCard label="TDEE hiện tại" value={tdee} hint={user?.bmr ? `BMR ${user.bmr.toLocaleString("vi-VN")}` : undefined} />
          <StatCard label="Mục tiêu Calo" value={calorieGoal} hint={`TDEE − ${CALORIE_DEFICIT}`} accent />
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
          Điền hồ sơ bên dưới để tính TDEE và mục tiêu calo mỗi ngày.
        </p>
      )}

      <CalorieIntakeCard
        date={today}
        initialCalories={dailyLog?.totalCalories ?? 0}
        calorieGoal={calorieGoal}
      />

      <YogaHabitCard date={today} initialCompleted={dailyLog?.yogaCompleted ?? false} />

      <ProfileCard
        complete={profileComplete}
        initial={{
          heightCm: user?.height ?? null,
          weightKg: user?.weight ?? null,
          targetWeightKg: user?.targetWeight ?? null,
          sex: user?.sex ?? null,
          birthYear: user?.birthYear ?? null,
          activityLevel: user?.activityLevel ?? null,
        }}
      />
    </div>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-4 ${accent ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : "bg-zinc-900"}`}>
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${accent ? "text-emerald-300" : "text-zinc-100"}`}>
        {value.toLocaleString("vi-VN")}
      </span>
      <span className="text-xs text-zinc-500">kcal/ngày{hint ? ` · ${hint}` : ""}</span>
    </div>
  );
}

function Landing() {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Slimfit Tracker</h1>
      <p className="max-w-sm text-zinc-400">
        Theo dõi calo, TDEE, buổi tập gym và thói quen yoga mỗi ngày.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <SignUpButton>
          <button className="h-14 rounded-xl bg-emerald-500 text-lg font-bold text-zinc-950">Bắt đầu miễn phí</button>
        </SignUpButton>
        <SignInButton>
          <button className="h-14 rounded-xl border border-zinc-700 text-lg font-medium text-zinc-200">Đăng nhập</button>
        </SignInButton>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-12 w-48 rounded-lg bg-zinc-900" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-zinc-900" />
        <div className="h-28 rounded-2xl bg-zinc-900" />
      </div>
      <div className="h-40 rounded-2xl bg-zinc-900" />
      <div className="h-24 rounded-2xl bg-zinc-900" />
    </div>
  );
}
