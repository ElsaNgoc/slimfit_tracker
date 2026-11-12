import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { NAV_TABS, TabNav, isTabActive } from "@/components/navigation/TabNav";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";

describe("isTabActive", () => {
  it("tab `/` chỉ active đúng trang chủ", () => {
    expect(isTabActive("/", "/")).toBe(true);
    expect(isTabActive("/workouts", "/")).toBe(false);
  });

  it("tab khác active cả route con, không nhầm tiền tố", () => {
    expect(isTabActive("/workouts", "/workouts")).toBe(true);
    expect(isTabActive("/workouts/123", "/workouts")).toBe(true);
    expect(isTabActive("/workoutsx", "/workouts")).toBe(false);
  });
});

describe("TabNav", () => {
  beforeEach(() => {
    pathname.current = "/";
  });

  it("có đủ 3 tab Tổng quan / Tập luyện / Hồ sơ với đúng href", () => {
    expect(NAV_TABS.map((t) => [t.label, t.href])).toEqual([
      ["Tổng quan", "/"],
      ["Tập luyện", "/workouts"],
      ["Hồ sơ", "/profile"],
    ]);
  });

  it.each(["bottom", "top"] as const)("variant %s đánh dấu tab đang mở bằng aria-current", (variant) => {
    pathname.current = "/profile";
    render(<TabNav variant={variant} />);
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });

    expect(within(nav).getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Tổng quan" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Tập luyện" })).toHaveAttribute("href", "/workouts");
  });

  it("bottom nav ẩn từ md, top nav chỉ hiện từ md", () => {
    const { unmount } = render(<TabNav variant="bottom" />);
    expect(screen.getByRole("navigation")).toHaveClass("fixed", "md:hidden");
    unmount();
    render(<TabNav variant="top" />);
    expect(screen.getByRole("navigation")).toHaveClass("hidden", "md:flex");
  });
});

describe("DashboardWidget", () => {
  it("không có children → hiện khung rỗng, region đặt tên theo tiêu đề", () => {
    render(<DashboardWidget id="meals" icon="🍽️" title="Bữa ăn hôm nay" emptyText="Chưa có dữ liệu bữa ăn." />);
    const region = screen.getByRole("region", { name: "Bữa ăn hôm nay" });
    expect(within(region).getByText("Chưa có dữ liệu bữa ăn.")).toBeInTheDocument();
  });

  it("có children → thay khung rỗng bằng nội dung", () => {
    render(
      <DashboardWidget id="habits" icon="✅" title="Thói quen" emptyText="Chưa có thói quen nào.">
        <p>Yoga 30 phút</p>
      </DashboardWidget>,
    );
    expect(screen.getByText("Yoga 30 phút")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có thói quen nào.")).not.toBeInTheDocument();
  });
});
