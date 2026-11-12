/**
 * Thư viện video Yoga & Giãn cơ (dữ liệu tĩnh — không cần DB).
 * Mỗi video đã kiểm tra ngày 2026-11-12: tồn tại + cho phép nhúng (YouTube oEmbed trả 200),
 * tiêu đề / kênh lấy từ oEmbed, thời lượng lấy từ `lengthSeconds` của trang video.
 * Thêm video mới: kiểm tra lại bằng
 *   curl "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"
 */

export type YogaVideo = {
  youtubeId: string;
  /** Tiêu đề gốc trên YouTube. */
  title: string;
  channel: string;
  durationSec: number;
  /** Nhãn ngắn: khi nào nên tập. */
  tag: string;
  /** Mô tả tiếng Việt 1 dòng. */
  summary: string;
};

export const YOGA_VIDEOS: YogaVideo[] = [
  {
    youtubeId: "g_tea8ZNk5A",
    title: "15 Min. Full Body Stretch | Daily Routine for Flexibility, Mobility & Relaxation",
    channel: "Mady Morrison",
    durationSec: 992,
    tag: "Sau buổi tập",
    summary: "Giãn cơ toàn thân nhẹ nhàng, hợp để hạ nhiệt sau gym.",
  },
  {
    youtubeId: "4pKly2JojMw",
    title: "10 min Morning Yoga Full Body Stretch",
    channel: "Yoga with Kassandra",
    durationSec: 655,
    tag: "Buổi sáng",
    summary: "10 phút đánh thức cơ thể, làm mềm cột sống và hông.",
  },
  {
    youtubeId: "SedzswEwpPw",
    title: "Yoga for Neck and Shoulder Relief",
    channel: "Yoga With Adriene",
    durationSec: 1058,
    tag: "Vai gáy",
    summary: "Gỡ căng cổ, vai, lưng trên — hợp ngày Upper Body hoặc ngồi máy tính nhiều.",
  },
  {
    youtubeId: "sTANio_2E0Q",
    title: "20 min Full Body STRETCH/YOGA for STRESS & ANXIETY Relief",
    channel: "MadFit",
    durationSec: 1256,
    tag: "Thư giãn",
    summary: "Giãn cơ chậm kết hợp thở sâu, giảm căng thẳng.",
  },
  {
    youtubeId: "BiWDsfZ3zbo",
    title: "Wind Down Yoga | 12-Minute Bedtime Yoga",
    channel: "Yoga With Adriene",
    durationSec: 723,
    tag: "Trước khi ngủ",
    summary: "Chuỗi động tác thả lỏng giúp dễ ngủ hơn.",
  },
];

/** Dữ liệu 1 card video — dùng chung cho video gợi ý và video yêu thích của user. */
export type VideoCardData = {
  youtubeId: string;
  title: string;
  channel: string | null;
  /** Chỉ video gợi ý có (oEmbed không trả thời lượng). */
  durationSec?: number;
  tag?: string;
  summary?: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * Lấy ID video (11 ký tự) từ link YouTube người dùng dán vào. Hỗ trợ:
 *   youtube.com/watch?v=ID (kể cả m. / music.), youtu.be/ID, /shorts/ID, /embed/ID, /live/ID, /v/ID,
 *   link thiếu "https://", và ID trần. Tham số thừa (?si=, &t=, &list=) được bỏ qua.
 * Không phải link YouTube / không có ID hợp lệ → null.
 */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (YOUTUBE_ID.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  let id: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const [, kind, value] = url.pathname.split("/");
      if (["shorts", "embed", "live", "v"].includes(kind)) id = value ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Ảnh thumbnail 16:9 (320×180) do YouTube cung cấp. */
export function youtubeThumbnail(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
}

/**
 * URL nhúng: youtube-nocookie (không đặt cookie theo dõi trước khi phát), tự phát vì người dùng vừa bấm,
 * `playsinline` để iOS không bật toàn màn hình, `rel=0` chỉ gợi ý video cùng kênh khi kết thúc.
 */
export function youtubeEmbedUrl(youtubeId: string): string {
  const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0" });
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/** 992 → "16:32"; 3725 → "1:02:05". */
export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
