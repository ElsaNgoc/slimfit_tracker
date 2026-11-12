"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addFavoriteVideo, deleteFavoriteVideo } from "@/actions/favorite-videos";
import {
  YOGA_VIDEOS,
  formatDuration,
  parseYoutubeId,
  youtubeEmbedUrl,
  youtubeThumbnail,
  youtubeWatchUrl,
  type VideoCardData,
} from "@/lib/yoga-videos";

export type FavoriteVideoItem = { id: number; youtubeId: string; title: string; channel: string | null };

/**
 * Thư viện video Yoga & Giãn cơ:
 *   - "Video yêu thích của bạn": dán link YouTube để lưu lại, hiện thumbnail như video gợi ý, xoá được.
 *   - "Gợi ý cho bạn": danh sách video chọn sẵn.
 * Card kiểu YouTube thu nhỏ (thumbnail trái, chữ phải trên mobile; lưới 2 cột từ sm). Bấm card → modal phát <iframe>.
 *
 * `favorites = null` → đang tải (fallback của <Suspense>): hiện khung chờ, khoá ô nhập.
 */
export function YogaVideoLibrary({
  favorites,
  suggestions = YOGA_VIDEOS,
}: {
  favorites: FavoriteVideoItem[] | null;
  suggestions?: VideoCardData[];
}) {
  const [playing, setPlaying] = useState<VideoCardData | null>(null);
  const headingId = useId();

  return (
    <section id="yoga-videos" aria-labelledby={headingId} className="flex scroll-mt-4 flex-col gap-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold tracking-tight">
          Yoga & Giãn cơ
        </h2>
        <p className="text-sm text-muted-foreground">Chọn một video để tập theo ngay trên web.</p>
      </div>

      <FavoriteVideos initial={favorites} onPlay={setPlaying} />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground/85">Gợi ý cho bạn</h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3" aria-label="Video gợi ý">
          {suggestions.map((v) => (
            <li key={v.youtubeId}>
              <VideoCard video={v} onPlay={() => setPlaying(v)} />
            </li>
          ))}
        </ul>
      </div>

      <YogaVideoModal video={playing} onClose={() => setPlaying(null)} />
    </section>
  );
}

// ---------- Video yêu thích ----------

function FavoriteVideos({
  initial,
  onPlay,
}: {
  initial: FavoriteVideoItem[] | null;
  onPlay: (video: VideoCardData) => void;
}) {
  const loading = initial === null;
  const [items, setItems] = useState<FavoriteVideoItem[]>(initial ?? []);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [, startTransition] = useTransition();
  const inputId = useId();
  const listId = useId();

  const previewId = link.trim() ? parseYoutubeId(link) : null;
  const duplicate = previewId !== null && items.some((v) => v.youtubeId === previewId);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!link.trim()) return setMessage({ type: "error", text: "Dán link video YouTube." });
    if (!previewId) {
      return setMessage({ type: "error", text: "Link không hợp lệ. Hãy dán link dạng youtube.com/watch?v=… hoặc youtu.be/…" });
    }
    if (duplicate) return setMessage({ type: "error", text: "Video này đã có trong danh sách yêu thích." });

    startSaving(async () => {
      const res = await addFavoriteVideo({ url: link });
      if (!res.ok) return setMessage({ type: "error", text: res.error });
      const { id, youtubeId, title, channel } = res.data;
      setItems((list) => [...list, { id, youtubeId, title, channel }]);
      setLink("");
      setMessage({ type: "success", text: `Đã lưu "${title}".` });
    });
  }

  function remove(video: FavoriteVideoItem) {
    if (!window.confirm(`Xoá "${video.title}" khỏi video yêu thích?`)) return;
    setMessage(null);
    const index = items.findIndex((v) => v.id === video.id);
    setItems((list) => list.filter((v) => v.id !== video.id)); // optimistic
    startTransition(async () => {
      const res = await deleteFavoriteVideo(video.id);
      if (!res.ok) {
        setItems((list) => [...list.slice(0, index), video, ...list.slice(index)]); // hoàn tác đúng vị trí
        setMessage({ type: "error", text: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card/60 p-3 ring-1 ring-foreground/5">
      <h3 id={listId} className="flex items-center gap-1.5 text-sm font-semibold text-foreground/85">
        <span aria-hidden className="text-accent">
          ♥
        </span>
        Video yêu thích của bạn
        {!loading && items.length > 0 && <span className="font-normal text-muted-foreground">({items.length})</span>}
      </h3>

      {loading ? (
        <div className="flex animate-pulse flex-col gap-2" aria-hidden>
          <div className="h-20 rounded-2xl bg-muted/60" />
        </div>
      ) : items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3" aria-labelledby={listId}>
          {items.map((v) => (
            <li key={v.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <VideoCard video={{ ...v, tag: "Yêu thích" }} onPlay={() => onPlay(v)} />
              </div>
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Xoá khỏi yêu thích: ${v.title}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-muted-foreground active:bg-muted"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Dán link YouTube bài giãn cơ bạn hay tập để lưu lại — lần sau mở là tập ngay, không cần tìm lại.
        </p>
      )}

      <form noValidate onSubmit={save} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Link video YouTube
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Dán link YouTube (youtu.be/… hoặc youtube.com/…)"
            value={link}
            disabled={loading}
            onChange={(e) => {
              setLink(e.target.value);
              setMessage(null);
            }}
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-faint focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || isSaving}
            className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
          >
            {isSaving ? "Đang kiểm tra…" : "Lưu video"}
          </button>
        </div>

        {/* Xem trước ngay khi nhận ra link — thumbnail suy ra từ ID, chưa cần gọi server */}
        {previewId && !message && (
          <div className="flex items-center gap-3 rounded-xl bg-background/60 p-2" data-testid="favorite-preview">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài nhỏ */}
            <img src={youtubeThumbnail(previewId)} alt="" className="aspect-video w-24 shrink-0 rounded-lg object-cover" />
            <p className="text-xs text-muted-foreground">
              {duplicate ? "Video này đã có trong danh sách yêu thích." : "Đã nhận ra video — bấm Lưu video để thêm."}
            </p>
          </div>
        )}

        {message && (
          <p
            role={message.type === "error" ? "alert" : "status"}
            className={`text-sm ${message.type === "error" ? "text-destructive" : "text-link"}`}
          >
            {message.text}
          </p>
        )}
      </form>
    </div>
  );
}

// ---------- Card + Modal ----------

function VideoCard({ video, onPlay }: { video: VideoCardData; onPlay: () => void }) {
  const duration = video.durationSec !== undefined ? formatDuration(video.durationSec) : null;
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Xem video: ${video.title}${duration ? ` (${duration})` : ""}`}
      className="flex w-full gap-3 rounded-2xl bg-card p-2 text-left ring-1 ring-foreground/5 transition-transform active:scale-[0.98] active:bg-muted sm:flex-col sm:p-0 sm:pb-3"
    >
      <span className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-full sm:rounded-b-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài nhỏ, không cần tối ưu qua next/image */}
        <img src={youtubeThumbnail(video.youtubeId)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        {duration && (
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
            {duration}
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full bg-black/60 text-lg text-white"
        >
          ▶
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1 py-0.5 sm:px-3">
        <span className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">{video.title}</span>
        {video.channel && <span className="truncate text-xs text-muted-foreground">{video.channel}</span>}
        {video.tag && (
          <span className="self-start rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-foreground">
            {video.tag}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Modal phát video. <dialog> native (Esc, focus trap, chạm nền tối để đóng).
 * <iframe> chỉ tồn tại khi đang mở → đóng modal là video dừng hẳn, không phát tiếng ngầm.
 */
function YogaVideoModal({ video, onClose }: { video: VideoCardData | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const open = video !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() tự focus phần tử focus được đầu tiên = iframe YouTube (khác origin) → phím Esc bị
      // trình phát nuốt mất, không tới được dialog. Chuyển focus sang nút Đóng để Esc luôn đóng được.
      closeRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const meta = video
    ? [video.channel, video.durationSec !== undefined ? formatDuration(video.durationSec) : null, video.tag]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Sự kiện "close" bắn bất đồng bộ: nếu dialog đã được mở lại (bấm mở ngay sau khi đóng) thì đó là sự kiện cũ → bỏ qua
      onClose={(e) => !e.currentTarget.open && onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-full bg-transparent p-0 text-foreground backdrop:bg-black/80 sm:my-auto sm:max-w-3xl"
    >
      {video && (
        <div className="flex flex-col overflow-hidden rounded-t-3xl bg-card pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-foreground/10 sm:rounded-3xl sm:pb-4">
          <div className="aspect-video w-full bg-black">
            <iframe
              key={video.youtubeId}
              src={youtubeEmbedUrl(video.youtubeId)}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              // YouTube cần Referer để phát video nhúng (thiếu → lỗi 153)
              referrerPolicy="strict-origin-when-cross-origin"
              className="size-full"
            />
          </div>
          <div className="flex items-start gap-3 px-4 pt-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base leading-snug font-bold">
                {video.title}
              </h2>
              {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
              {video.summary && <p className="mt-1 text-sm text-muted-foreground">{video.summary}</p>}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Đóng video"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-2xl text-foreground/85 active:bg-muted/70"
            >
              ×
            </button>
          </div>
          <a
            href={youtubeWatchUrl(video.youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mt-3 flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-medium text-foreground/85 active:bg-muted"
          >
            Mở trên YouTube ↗
          </a>
        </div>
      )}
    </dialog>
  );
}
