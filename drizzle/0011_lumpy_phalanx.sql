CREATE TYPE "public"."workout_phase" AS ENUM('main', 'finisher');--> statement-breakpoint
ALTER TABLE "workout_sets" ALTER COLUMN "reps" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "phase" "workout_phase" DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "phase" "workout_phase" DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "duration_sec" integer;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;