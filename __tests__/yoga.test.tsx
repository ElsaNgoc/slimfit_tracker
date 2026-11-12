import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync } from "node:fs";
vi.mock("@/actions/favorite-videos", () => ({ addFavoriteVideo: vi.fn(), deleteFavoriteVideo: vi.fn() }));

import { addFavoriteVideo, deleteFavoriteVideo } from "@/actions/favorite-videos";
import { YogaVideoLibrary, type FavoriteVideoItem } from "@/components/yoga/YogaVideoLibrary";
import {
  YOGA_VIDEOS,
  formatDuration,
  parseYoutubeId,
  youtubeEmbedUrl,
  youtubeThumbnail,
  youtubeWatchUrl,
} from "@/lib/yoga-videos";

describe("lib/yoga-videos", () => {
  it("3–5 video, ID YouTube hợp lệ (11 ký tự) và không trùng", () => {
    expect(YOGA_VIDEOS.length).toBeGreaterThanOrEqual(3);
    expect(YOGA_VIDEOS.length).toBeLessThanOrEqual(5);
    for (const v of YOGA_VIDEOS) expect(v.youtubeId).toMatch(/^[\w-]{11}$/);
    expect(new Set(YOGA_VIDEOS.map((v) => v.youtubeId)).size).toBe(YOGA_VIDEOS.length);
  });

  it("URL nhúng: youtube-nocookie, tự phát, phát trong trang trên iOS", () => {
    const url = new URL(youtubeEmbedUrl("g_tea8ZNk5A"));
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/g_tea8ZNk5A");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("playsinline")).toBe("1");
    expect(youtubeThumbnail("g_tea8ZNk5A")).toBe("https://i.ytimg.com/vi/g_tea8ZNk5A/mqdefault.jpg");
    expect(youtubeWatchUrl("g_tea8ZNk5A")).toBe("https://www.youtube.com/watch?v=g_tea8ZNk5A");
  });

  it("formatDuration", () => {
    expect(formatDuration(992)).toBe("16:32");
    expect(formatDuration(655)).toBe("10:55");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("component ảnh tĩnh YogaLibrary cũ đã bị xoá", () => {
    expect(existsSync("src/components/YogaLibrary.tsx")).toBe(false);
  });
});

describe("YogaVideoLibrary", () => {
  it("danh sách card: thumbnail, thời lượng, tiêu đề, kênh, nhãn", () => {
    render(<YogaVideoLibrary favorites={[]} />);
    const section = screen.getByRole("region", { name: "Yoga & Giãn cơ" });
    const cards = within(section).getAllByRole("button", { name: /^Xem video:/ });
    expect(cards).toHaveLength(YOGA_VIDEOS.length);

    const first = YOGA_VIDEOS[0];
    const card = within(section).getByRole("button", { name: `Xem video: ${first.title} (16:32)` });
    expect(card.querySelector("img")).toHaveAttribute("src", youtubeThumbnail(first.youtubeId));
    expect(within(card).getByText("16:32")).toBeInTheDocument();
    expect(within(card).getByText(first.channel)).toBeInTheDocument();
    expect(within(card).getByText(first.tag)).toBeInTheDocument();
    // Chưa mở video → chưa tải iframe nào
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("bấm card → modal phát video bằng iframe YouTube; đóng → iframe bị gỡ (video dừng)", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[]} />);
    const video = YOGA_VIDEOS[2];

    await user.click(screen.getByRole("button", { name: new RegExp(`^Xem video: ${video.title}`) }));

    const dialog = screen.getByRole("dialog", { name: video.title });
    const iframe = dialog.querySelector("iframe")!;
    expect(iframe).toHaveAttribute("src", youtubeEmbedUrl(video.youtubeId));
    expect(iframe).toHaveAttribute("title", video.title);
    expect(iframe.getAttribute("allow")).toContain("autoplay");
    expect(iframe).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    // Focus không rơi vào iframe (khác origin → Esc không tới được dialog)
    expect(within(dialog).getByRole("button", { name: "Đóng video" })).toHaveFocus();
    expect(within(dialog).getByText(video.summary)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Mở trên YouTube/ })).toHaveAttribute(
      "href",
      youtubeWatchUrl(video.youtubeId),
    );

    await user.click(within(dialog).getByRole("button", { name: "Đóng video" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("chuyển sang video khác → iframe đổi đúng video", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[]} />);
    const [a, b] = YOGA_VIDEOS;

    await user.click(screen.getByRole("button", { name: new RegExp(`^Xem video: ${a.title}`) }));
    // Esc trên <dialog> → trình duyệt bắn sự kiện "cancel" (polyfill jsdom không giả lập phím; E2E kiểm tra Esc thật)
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());

    await user.click(screen.getByRole("button", { name: new RegExp(`^Xem video: ${b.title}`) }));
    expect(document.querySelector("iframe")).toHaveAttribute("src", youtubeEmbedUrl(b.youtubeId));
  });
});

// ---------- Video yêu thích ----------

const add = vi.mocked(addFavoriteVideo);
const del = vi.mocked(deleteFavoriteVideo);

describe("parseYoutubeId — đọc ID từ link người dùng dán", () => {
  it.each([
    ["https://www.youtube.com/watch?v=v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["https://www.youtube.com/watch?v=v7AYKMP6rOE&t=120s&list=PL123", "v7AYKMP6rOE"],
    ["https://m.youtube.com/watch?v=v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["https://youtu.be/v7AYKMP6rOE?si=AbCdEf123", "v7AYKMP6rOE"],
    ["youtu.be/v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["www.youtube.com/watch?v=v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["https://www.youtube.com/shorts/v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["https://www.youtube.com/embed/v7AYKMP6rOE?start=10", "v7AYKMP6rOE"],
    ["https://www.youtube-nocookie.com/embed/v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["https://www.youtube.com/live/v7AYKMP6rOE", "v7AYKMP6rOE"],
    ["  v7AYKMP6rOE  ", "v7AYKMP6rOE"],
  ])("%s → %s", (input, id) => {
    expect(parseYoutubeId(input)).toBe(id);
  });

  it.each([
    "",
    "giãn cơ",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/@YogaWithAdriene",
    "https://www.youtube.com/watch?v=short",
    "https://evil.com/watch?v=v7AYKMP6rOE",
    "https://youtube.com.evil.com/watch?v=v7AYKMP6rOE",
  ])("không phải link video YouTube: %j → null", (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});

const FAV: FavoriteVideoItem = {
  id: 1,
  youtubeId: "v7AYKMP6rOE",
  title: "Yoga For Complete Beginners - 20 Minute Home Yoga Workout!",
  channel: "Yoga With Adriene",
};
const favList = () => screen.getByRole("list", { name: /Video yêu thích của bạn/ });
const linkInput = () => screen.getByLabelText("Link video YouTube");

describe("YogaVideoLibrary — video yêu thích", () => {
  beforeEach(() => {
    add.mockImplementation(async ({ url }) => ({
      ok: true,
      data: {
        id: 99,
        userId: "u",
        youtubeId: parseYoutubeId(url)!,
        title: "Yoga For Hips",
        channel: "Yoga With Adriene",
        createdAt: new Date(),
      },
    }));
    del.mockImplementation(async (id) => ({ ok: true, data: { id } }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("đang tải (favorites = null): khoá ô nhập, video gợi ý vẫn hiện", () => {
    render(<YogaVideoLibrary favorites={null} />);
    expect(linkInput()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu video" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Xem video:/ })).toHaveLength(YOGA_VIDEOS.length);
  });

  it("chưa có video yêu thích → hướng dẫn dán link", () => {
    render(<YogaVideoLibrary favorites={[]} />);
    expect(screen.getByText(/Dán link YouTube bài giãn cơ bạn hay tập/)).toBeInTheDocument();
  });

  it("video đã lưu hiện như card thường (thumbnail theo ID, kênh, nhãn Yêu thích) và mở được modal", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[FAV]} />);
    const card = within(favList()).getByRole("button", { name: `Xem video: ${FAV.title}` });
    expect(card.querySelector("img")).toHaveAttribute("src", youtubeThumbnail(FAV.youtubeId));
    expect(within(card).getByText("Yoga With Adriene")).toBeInTheDocument();
    expect(within(card).getByText("Yêu thích")).toBeInTheDocument();

    await user.click(card);
    const dialog = screen.getByRole("dialog", { name: FAV.title });
    expect(dialog.querySelector("iframe")).toHaveAttribute("src", youtubeEmbedUrl(FAV.youtubeId));
  });

  it("dán link → xem trước thumbnail ngay → Lưu → card mới xuất hiện, ô nhập được xoá", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[]} />);

    await user.click(linkInput());
    await user.paste("https://youtu.be/4pKly2JojMw?si=abc");
    const preview = screen.getByTestId("favorite-preview");
    expect(preview.querySelector("img")).toHaveAttribute("src", youtubeThumbnail("4pKly2JojMw"));

    await user.click(screen.getByRole("button", { name: "Lưu video" }));
    expect(add).toHaveBeenCalledWith({ url: "https://youtu.be/4pKly2JojMw?si=abc" });
    expect(await screen.findByRole("status")).toHaveTextContent('Đã lưu "Yoga For Hips".');
    expect(within(favList()).getByRole("button", { name: "Xem video: Yoga For Hips" })).toBeInTheDocument();
    expect(linkInput()).toHaveValue("");
  });

  it("link không hợp lệ / trùng → báo lỗi ngay, không gọi server", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[FAV]} />);

    await user.type(linkInput(), "https://vimeo.com/123");
    expect(screen.queryByTestId("favorite-preview")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lưu video" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Link không hợp lệ");

    await user.clear(linkInput());
    await user.type(linkInput(), "https://www.youtube.com/watch?v=v7AYKMP6rOE");
    expect(screen.getByTestId("favorite-preview")).toHaveTextContent("đã có trong danh sách yêu thích");
    await user.click(screen.getByRole("button", { name: "Lưu video" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Video này đã có trong danh sách yêu thích.");
    expect(add).not.toHaveBeenCalled();
  });

  it("server từ chối (vd. video chặn nhúng) → hiện lỗi, giữ link trong ô", async () => {
    add.mockResolvedValueOnce({ ok: false, error: "Chủ video không cho phép phát trên trang khác, nên không lưu được." });
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[]} />);
    await user.type(linkInput(), "https://youtu.be/4pKly2JojMw");
    await user.click(screen.getByRole("button", { name: "Lưu video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("không cho phép phát trên trang khác");
    expect(linkInput()).toHaveValue("https://youtu.be/4pKly2JojMw");
  });

  it("xoá: hỏi xác nhận; đồng ý → xoá; server lỗi → trả lại video", async () => {
    const user = userEvent.setup();
    render(<YogaVideoLibrary favorites={[FAV]} />);

    del.mockResolvedValueOnce({ ok: false, error: "Không tìm thấy video." });
    await user.click(screen.getByRole("button", { name: `Xoá khỏi yêu thích: ${FAV.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy video.");
    expect(within(favList()).getByRole("button", { name: `Xem video: ${FAV.title}` })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Xoá khỏi yêu thích: ${FAV.title}` }));
    await waitFor(() => expect(screen.queryByRole("list", { name: /Video yêu thích của bạn/ })).not.toBeInTheDocument());
    expect(del).toHaveBeenLastCalledWith(1);
  });
});
