/** Logic thói quen thuần (dùng được ở server lẫn client). */

export const HABIT_NAME_MAX = 60;

/** Ý tưởng "Gợi ý làm đẹp" — bấm để thêm nhanh. */
export const BEAUTY_SUGGESTIONS = [
  "Giãn cơ 30 phút",
  "Chăm sóc tóc",
  "Uống 2L nước",
  "Skin care sáng & tối",
  "Đắp mặt nạ",
  "Thoa kem chống nắng",
  "Ngủ trước 23h",
  "Tẩy tế bào chết",
] as const;

/** Gộp khoảng trắng thừa — tên lưu vào DB luôn ở dạng này. */
export function normalizeHabitName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Khoá so sánh trùng tên (không phân biệt hoa thường), khớp unique index `lower(name)` trong DB. */
export function habitKey(name: string): string {
  return normalizeHabitName(name).toLowerCase();
}

/** Gợi ý chưa có trong danh sách hiện tại. */
export function remainingSuggestions(existingNames: readonly string[]): string[] {
  const taken = new Set(existingNames.map(habitKey));
  return BEAUTY_SUGGESTIONS.filter((s) => !taken.has(habitKey(s)));
}
