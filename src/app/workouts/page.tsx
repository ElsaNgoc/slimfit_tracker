import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getExercises } from "@/db/queries/exercises";
import { getWeeklySchedule } from "@/db/queries/schedule";
import { WorkoutLogger } from "@/components/WorkoutLogger";
import { YogaLibrary } from "@/components/YogaLibrary";
import type { ExerciseDetail } from "@/components/ExerciseInfoModal";
import { todayInAppTz } from "@/lib/date";

export const metadata: Metadata = {
  title: "Ghi chép tập luyện — Slimfit Tracker",
};

export default function WorkoutsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Ghi chép tập luyện</h1>
      <Suspense fallback={<LoggerSkeleton />}>
        <WorkoutLoggerLoader />
      </Suspense>
    </div>
  );
}

/** Đọc DB + ngày hiện tại ở request time → nằm trong Suspense (Cache Components). */
async function WorkoutLoggerLoader() {
  await connection();
  const { userId } = await auth(); // route đã được proxy.ts bảo vệ
  const [all, schedule] = await Promise.all([getExercises(), getWeeklySchedule(userId)]);
  const today = todayInAppTz(); // giờ Việt Nam (server chạy UTC)

  const details: ExerciseDetail[] = all.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    muscleGroup: e.muscleGroup,
    instruction: e.instruction,
    gifUrl: e.gifUrl,
    imageCredit: e.imageCredit,
    recommendedWeight: e.recommendedWeight,
    tips: e.tips,
  }));

  return (
    <>
      <WorkoutLogger
        today={today}
        schedule={schedule}
        exercises={details.filter((e) => e.category === "gym")}
      />
      {/* pb-28: chừa chỗ cho thanh Save Workout cố định ở đáy */}
      <div className="pb-28">
        <YogaLibrary poses={details.filter((e) => e.category === "yoga")} />
      </div>
    </>
  );
}

function LoggerSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-14 rounded-2xl bg-zinc-900" />
      <div className="h-14 rounded-2xl bg-zinc-900" />
      <div className="h-48 rounded-2xl bg-zinc-900" />
    </div>
  );
}
