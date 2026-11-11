CREATE TYPE "public"."exercise_category" AS ENUM('gym', 'yoga');--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"total_calories" integer DEFAULT 0 NOT NULL,
	"yoga_completed" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exercises_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"category" "exercise_category" NOT NULL,
	"muscle_group" text,
	"instruction" text,
	"gif_url" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"height" real,
	"weight" real,
	"target_weight" real,
	"bmr" integer,
	"tdee" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workout_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workout_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"workout_log_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight" real,
	"set_number" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_log_id_workout_logs_id_fk" FOREIGN KEY ("workout_log_id") REFERENCES "public"."workout_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_logs_user_date_uq" ON "daily_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "exercises_category_idx" ON "exercises" USING btree ("category");--> statement-breakpoint
CREATE INDEX "workout_logs_user_date_idx" ON "workout_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "workout_sets_log_idx" ON "workout_sets" USING btree ("workout_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sets_log_exercise_set_uq" ON "workout_sets" USING btree ("workout_log_id","exercise_id","set_number");