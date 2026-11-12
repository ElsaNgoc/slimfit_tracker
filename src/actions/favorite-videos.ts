"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { favoriteVideos, type FavoriteVideo } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { parseYoutubeId, youtubeWatchUrl } from "@/lib/yoga-videos";

/** Số video yêu thích tối đa mỗi user (giữ danh sách gọn, tránh spam). */
const MAX_FAVORITES = 50;
const OEMBED_TIMEOUT_MS = 6000;

type OEmbedResult =
  | { ok: true; title: string; channel: string | null }
  | { ok: false; error: string };

/**
 * Hỏi YouTube oEmbed (công khai, không cần API key) để chắc video tồn tại + cho phép nhúng,
 * đồng thời lấy tiêu đề / kênh. Chỉ gửi đi link video, không kèm thông tin người dùng.
 *   200 → OK · 401/403 → chủ video chặn nhúng · 400/404 → riêng tư / đã xoá / sai ID.
 */
async function fetchOEmbed(youtubeId: string): Promise<OEmbedResult> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(youtubeId))}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS), cache: "no-store" });
  } catch {
    return { ok: false, error: "Không kết nối được YouTube để kiểm tra video, vui lòng thử lại." };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Chủ video không cho phép phát trên trang khác, nên không lưu được." };
  }
  if (!res.ok) return { ok: false, error: "Không tìm thấy video (có thể là video riêng tư hoặc đã bị xoá)." };

  const data = (await res.json().catch(() => null)) as { title?: unknown; author_name?: unknown } | null;
  const title = typeof data?.title === "string" ? data.title.trim().slice(0, 200) : "";
  const channel = typeof data?.author_name === "string" ? data.author_name.trim().slice(0, 100) || null : null;
  return { ok: true, title: title || "Video YouTube", channel };
}

const linkSchema = z.string().trim().min(1, "Dán link video YouTube.").max(500);

/** POST — lưu video YouTube yêu thích từ link người dùng dán vào. */
export async function addFavoriteVideo(input: { url: string }): Promise<ActionResult<FavoriteVideo>> {
  try {
    const userId = await requireUserId();
    const youtubeId = parseYoutubeId(linkSchema.parse(input.url));
    if (!youtubeId) {
      return { ok: false, error: "Link không hợp lệ. Hãy dán link dạng youtube.com/watch?v=… hoặc youtu.be/…" };
    }

    const existing = await db
      .select({ id: favoriteVideos.id, youtubeId: favoriteVideos.youtubeId })
      .from(favoriteVideos)
      .where(eq(favoriteVideos.userId, userId));
    if (existing.some((v) => v.youtubeId === youtubeId)) {
      return { ok: false, error: "Video này đã có trong danh sách yêu thích." };
    }
    if (existing.length >= MAX_FAVORITES) {
      return { ok: false, error: `Đã đủ ${MAX_FAVORITES} video yêu thích — xoá bớt video cũ để thêm mới.` };
    }

    const meta = await fetchOEmbed(youtubeId);
    if (!meta.ok) return meta;

    // unique (user_id, youtube_id): bấm Lưu 2 lần cùng lúc → lần sau không chèn thêm
    const [video] = await db
      .insert(favoriteVideos)
      .values({ userId, youtubeId, title: meta.title, channel: meta.channel })
      .onConflictDoNothing()
      .returning();
    if (!video) return { ok: false, error: "Video này đã có trong danh sách yêu thích." };
    return { ok: true, data: video };
  } catch (err) {
    return toActionError(err);
  }
}

/** DELETE — xoá video yêu thích của chính user. */
export async function deleteFavoriteVideo(id: number): Promise<ActionResult<{ id: number }>> {
  try {
    const userId = await requireUserId();
    const vid = z.number().int().positive().parse(id);
    const deleted = await db
      .delete(favoriteVideos)
      .where(and(eq(favoriteVideos.id, vid), eq(favoriteVideos.userId, userId)))
      .returning({ id: favoriteVideos.id });
    if (deleted.length === 0) return { ok: false, error: "Không tìm thấy video." };
    return { ok: true, data: deleted[0] };
  } catch (err) {
    return toActionError(err);
  }
}
