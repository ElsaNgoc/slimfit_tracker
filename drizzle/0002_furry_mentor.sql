ALTER TABLE "exercises" ADD COLUMN "image_credit" text;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_uq" ON "exercises" USING btree ("name");