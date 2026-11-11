import "server-only";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { exercises, exerciseCategoryEnum } from "@/db/schema";

export type ExerciseCategory = (typeof exerciseCategoryEnum.enumValues)[number];

export type ExerciseFilter = {
  category?: ExerciseCategory;
  muscleGroup?: string;
  search?: string;
};

/** Lấy danh sách bài tập — dùng trực tiếp trong Server Components hoặc qua GET /api/exercises. */
export async function getExercises(filter: ExerciseFilter = {}) {
  const conditions = [
    filter.category ? eq(exercises.category, filter.category) : undefined,
    filter.muscleGroup ? eq(exercises.muscleGroup, filter.muscleGroup) : undefined,
    filter.search ? ilike(exercises.name, `%${filter.search}%`) : undefined,
  ];

  return db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(asc(exercises.name));
}
