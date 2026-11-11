/**
 * Seed bảng `exercises` từ src/db/seed/exercises.json.
 * Chạy: npm run db:seed   (cần đã `npm run db:migrate`)
 * Idempotent: upsert theo `name` (unique) — chạy lại sẽ cập nhật ảnh/hướng dẫn.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: ".env.local" });

const seedSchema = z.object({
  exercises: z
    .array(
      z.object({
        name: z.string().min(1),
        category: z.enum(["gym", "yoga"]),
        muscleGroup: z.string().nullable(),
        instruction: z.string().nullable(),
        gifUrl: z.string().nullable(),
        imageCredit: z.string().nullable(),
        recommendedWeight: z.string().nullable().default(null),
        tips: z.string().nullable().default(null),
      }),
    )
    .min(1),
});

async function main() {
  // Import động để dotenv nạp DATABASE_URL trước khi src/db khởi tạo kết nối.
  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { exercises } = await import("../src/db/schema");

  const file = resolve(process.cwd(), "src/db/seed/exercises.json");
  const { exercises: rows } = seedSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const result = await db
    .insert(exercises)
    .values(rows)
    .onConflictDoUpdate({
      target: exercises.name,
      set: {
        category: sql`excluded.category`,
        muscleGroup: sql`excluded.muscle_group`,
        instruction: sql`excluded.instruction`,
        gifUrl: sql`excluded.gif_url`,
        imageCredit: sql`excluded.image_credit`,
        recommendedWeight: sql`excluded.recommended_weight`,
        tips: sql`excluded.tips`,
      },
    })
    .returning({ id: exercises.id, name: exercises.name, category: exercises.category });

  const yoga = result.filter((r) => r.category === "yoga").length;
  console.log(`✓ Seed ${result.length} bài tập (${result.length - yoga} gym, ${yoga} yoga).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
