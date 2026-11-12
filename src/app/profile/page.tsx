import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getUserProfile } from "@/db/queries/profile";
import { getCustomFoods } from "@/db/queries/custom-foods";
import { CALORIE_DEFICIT, calculateCalorieGoal } from "@/lib/energy";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileMenu } from "@/components/profile/ProfileMenu";
import { WeightChart } from "@/components/profile/WeightChart";
import { getWeightLogs } from "@/db/queries/weight-logs";
import { todayInAppTz } from "@/lib/date";

export const metadata: Metadata = {
  title: "Hồ sơ — Slimfit Tracker",
};

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="text-2xl font-bold tracking-tight">Hồ sơ</h1>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

/** Đọc auth + DB ở request time → phải nằm trong Suspense (Cache Components). */
async function ProfileContent() {
  const { userId } = await auth(); // route đã được proxy.ts bảo vệ
  const [user, customFoods, weightLogs] = userId
    ? await Promise.all([getUserProfile(userId), getCustomFoods(userId), getWeightLogs(userId)])
    : [null, [], []];

  const tdee = user?.tdee ?? null;
  const calorieGoal = tdee !== null ? calculateCalorieGoal(tdee) : null;
  const profileComplete = Boolean(
    user?.height && user.weight && user.sex && user.birthYear && user.activityLevel,
  );

  return (
    <>
      {/* TDEE & mục tiêu calo — tính từ hồ sơ bên dưới */}
      {tdee !== null && calorieGoal !== null ? (
        <section className="grid grid-cols-2 gap-3">
          <StatCard label="TDEE hiện tại" value={tdee} hint={user?.bmr ? `BMR ${user.bmr.toLocaleString("vi-VN")}` : undefined} />
          <StatCard label="Mục tiêu Calo" value={calorieGoal} hint={`TDEE − ${CALORIE_DEFICIT}`} accent />
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Điền hồ sơ bên dưới để tính TDEE và mục tiêu calo mỗi ngày.
        </p>
      )}

      {/* Biểu đồ cân nặng (chuyển từ Tổng quan sang) — nút cập nhật cân nặng hôm nay / cân nặng ban đầu */}
      <WeightChart
        logs={weightLogs}
        today={todayInAppTz()}
        targetWeightKg={user?.targetWeight ?? null}
        profileWeightKg={user?.weight ?? null}
      />

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

      {/* Từ điển món ăn · Hướng dẫn sử dụng · Cài đặt giao diện */}
      <ProfileMenu customFoodCount={customFoods.length} />
    </>
  );
}

function StatCard({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-2xl p-4 ${accent ? "bg-primary/10 ring-1 ring-primary/40" : "bg-card"}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${accent ? "text-link" : "text-foreground"}`}>
        {value.toLocaleString("vi-VN")}
      </span>
      <span className="text-xs text-muted-foreground">kcal/ngày{hint ? ` · ${hint}` : ""}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-card" />
        <div className="h-28 rounded-2xl bg-card" />
      </div>
      <div className="h-72 rounded-2xl bg-card" />
      <div className="h-64 rounded-2xl bg-card" />
      <div className="h-40 rounded-2xl bg-card" />
    </div>
  );
}
