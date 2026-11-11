import "server-only";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Trả về Clerk userId của request hiện tại và đảm bảo đã có bản ghi tương ứng
 * trong bảng `users` (cần cho foreign key của workout_logs / daily_logs).
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  await db.insert(users).values({ id: userId }).onConflictDoNothing({ target: users.id });

  return userId;
}
