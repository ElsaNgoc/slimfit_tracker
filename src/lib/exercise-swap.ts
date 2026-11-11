/**
 * Gợi ý bài thay thế (Swap Exercise) dựa trên `muscle_group`.
 * muscle_group là chuỗi "Nhóm chính, Nhóm phụ, …" — nhóm đầu tiên là nhóm cơ chính.
 */

type SwapCandidate = { id: number; name: string; category: string; muscleGroup: string | null };

export const MAX_SWAP_OPTIONS = 6;

/** Tách + chuẩn hoá nhóm cơ: bỏ phần trong ngoặc, viết thường. "Mông nhỡ (mông bên), Hông" → ["mông nhỡ", "hông"]. */
export function muscleTokens(muscleGroup: string | null): string[] {
  return (muscleGroup ?? "")
    .split(",")
    .map((m) => m.replace(/\(.*?\)/g, "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Điểm tương đồng của `candidate` so với `current`:
 * 2 — cùng nhóm cơ chính;
 * 1 — candidate có tác động phụ lên nhóm cơ chính của current;
 * 0 — không liên quan.
 */
export function swapScore(current: SwapCandidate, candidate: SwapCandidate): number {
  const [a] = muscleTokens(current.muscleGroup);
  const [b, ...bRest] = muscleTokens(candidate.muscleGroup);
  if (!a || !b) return 0;
  if (a === b) return 2;
  return bRest.includes(a) ? 1 : 0;
}

/**
 * Danh sách bài thay thế cùng loại (gym/yoga), loại bỏ bài đang có trong buổi tập.
 * Ưu tiên bài cùng nhóm cơ chính; chỉ khi không có mới dùng bài tác động phụ
 * (tránh gợi ý kiểu Lat Pulldown → Bicep Curl chỉ vì cùng có "Tay trước").
 */
export function findSwapAlternatives<T extends SwapCandidate>(
  current: SwapCandidate,
  all: T[],
  excludeIds: ReadonlySet<number> = new Set(),
  limit = MAX_SWAP_OPTIONS,
): T[] {
  const scored = all
    .filter((e) => e.id !== current.id && e.category === current.category && !excludeIds.has(e.id))
    .map((e) => ({ e, score: swapScore(current, e) }))
    .filter((x) => x.score > 0);
  const best = Math.max(0, ...scored.map((x) => x.score));
  return scored
    .filter((x) => x.score === best)
    .sort((x, y) => x.e.name.localeCompare(y.e.name, "vi"))
    .slice(0, limit)
    .map((x) => x.e);
}
