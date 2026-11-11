import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getExercises } from "@/db/queries/exercises";
import { exerciseCategoryEnum } from "@/db/schema";

const querySchema = z.object({
  category: z.enum(exerciseCategoryEnum.enumValues).optional(),
  muscleGroup: z.string().trim().min(1).max(50).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

/**
 * GET /api/exercises?category=gym|yoga&muscleGroup=chest&search=press
 * Route được bảo vệ bởi Clerk trong src/proxy.ts.
 */
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const data = await getExercises(parsed.data);
  return NextResponse.json({ data });
}
