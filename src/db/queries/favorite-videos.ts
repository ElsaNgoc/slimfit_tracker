import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { favoriteVideos } from "@/db/schema";

/** Video yêu thích của user, cũ → mới (video vừa lưu nằm cuối danh sách). */
export async function getFavoriteVideos(userId: string) {
  return db
    .select({
      id: favoriteVideos.id,
      youtubeId: favoriteVideos.youtubeId,
      title: favoriteVideos.title,
      channel: favoriteVideos.channel,
    })
    .from(favoriteVideos)
    .where(eq(favoriteVideos.userId, userId))
    .orderBy(asc(favoriteVideos.createdAt), asc(favoriteVideos.id));
}
