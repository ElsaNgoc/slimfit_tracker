import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getExercises } from "@/db/queries/exercises";
import { getWeeklySchedule } from "@/db/queries/schedule";
import { getFavoriteVideos } from "@/db/queries/favorite-videos";
import { getWorkoutForDate } from "@/db/queries/workouts";
import { WorkoutLogger } from "@/components/WorkoutLogger";
import { YogaVideoLibrary } from "@/components/yoga/YogaVideoLibrary";
import type { ExerciseDetail } from "@/components/ExerciseInfoModal";
import { todayInAppTz } from "@/lib/date";

export const metadata: Metadata = {
  title: "Ghi chép tập luyện — Slimfit Tracker",
};

export default function WorkoutsPage({ searchParams }: PageProps<"/workouts">) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Ghi chép tập luyện</h1>
      <Suspense fallback={<LoggerSkeleton />}>
        <WorkoutLoggerLoader searchParams={searchParams} />
      </Suspense>
      {/* Fallback = thư viện với favorites null: video gợi ý (tĩnh) hiện ngay, chỉ khối "yêu thích" chờ DB. */}
      <div className="pb-8">
        <Suspense fallback={<YogaVideoLibrary favorites={null} />}>
          <YogaVideosLoader />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Đọc DB + ngày hiện tại + searchParams ở request time → nằm trong Suspense (Cache Components).
 *   ?date=YYYY-MM-DD — ngày đang ghi (mặc định hôm nay; không nhận ngày tương lai) → nạp buổi tập đã auto-save
 *   ?start=today     — từ nút "Bắt đầu tập" ở Tổng quan: nạp sẵn bài của buổi hôm nay
 *   ?schedule=edit   — từ link "Đổi lịch" ở Tổng quan: mở sẵn Cài đặt lịch tuần
 */
async function WorkoutLoggerLoader({ searchParams }: { searchParams: PageProps<"/workouts">["searchParams"] }) {
  const query = await searchParams;
  await connection();
  const { userId } = await auth(); // route đã được proxy.ts bảo vệ
  const today = todayInAppTz(); // giờ Việt Nam (server chạy UTC)
  const requested = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : today;
  const date = requested <= today ? requested : today;
  const [gym, schedule, log] = await Promise.all([
    getExercises({ category: "gym" }),
    getWeeklySchedule(userId),
    userId ? getWorkoutForDate(userId, date) : null,
  ]);

  const details: ExerciseDetail[] = gym.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    muscleGroup: e.muscleGroup,
    instruction: e.instruction,
    gifUrl: e.gifUrl,
    imageCredit: e.imageCredit,
    recommendedWeight: e.recommendedWeight,
    tips: e.tips,
    phase: e.phase,
  }));

  return (
    <WorkoutLogger
      // Đổi ngày = dựng lại state từ buổi tập của ngày đó
      key={date}
      today={today}
      date={date}
      initialLog={log}
      schedule={schedule}
      exercises={details}
      autoStart={query.start === "today"}
      openSettings={query.schedule === "edit"}
    />
  );
}

/** Video yêu thích của user (DB, request time) → trong Suspense. */
async function YogaVideosLoader() {
  const { userId } = await auth(); // route đã được proxy.ts bảo vệ
  const favorites = userId ? await getFavoriteVideos(userId) : [];
  return <YogaVideoLibrary favorites={favorites} />;
}

function LoggerSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-14 rounded-2xl bg-card" />
      <div className="h-14 rounded-2xl bg-card" />
      <div className="h-48 rounded-2xl bg-card" />
    </div>
  );
}
