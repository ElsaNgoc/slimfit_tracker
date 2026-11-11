import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExerciseMedia } from "@/components/ExerciseMedia";
import seed from "@/db/seed/exercises.json";

const publicDir = resolve(process.cwd(), "public");
const STEPS_DIR = "exercises/steps";

/** Kích thước PNG đọc từ chunk IHDR (byte 16–23). */
function pngSize(file: string) {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------- Seed ↔ file ảnh local ----------

describe("seed gifUrl", () => {
  const local = seed.exercises.filter((e) => e.gifUrl?.startsWith("/"));

  it("mọi đường dẫn local đều tồn tại trong public/", () => {
    for (const e of local) expect(existsSync(resolve(publicDir, `.${e.gifUrl}`)), e.gifUrl!).toBe(true);
  });

  it("không còn ảnh động / video — chỉ ảnh tĩnh", () => {
    for (const e of seed.exercises) expect(e.gifUrl ?? "", e.name).not.toMatch(/\.(gif|mp4|webm|mov)([?#]|$)/i);
    expect(existsSync(resolve(publicDir, "exercises/anim"))).toBe(false);
  });

  it("mọi ảnh ghép 2 tư thế đều được seed dùng, là PNG 4:3 và có ghi nguồn CC BY-SA", () => {
    const files = readdirSync(resolve(publicDir, STEPS_DIR)).filter((f) => f.endsWith(".png"));
    const used = new Map(local.map((e) => [e.gifUrl, e]));
    expect(files.length).toBeGreaterThanOrEqual(24);
    for (const f of files) {
      const e = used.get(`/${STEPS_DIR}/${f}`);
      expect(e, `${f} không được bài nào dùng`).toBeDefined();
      expect(e!.imageCredit).toMatch(/CC BY-SA [34]\.0 \(ghép 2 tư thế\)/);
      expect(pngSize(resolve(publicDir, STEPS_DIR, f)), f).toEqual({ width: 1200, height: 900 });
    }
  });

  it("các bài cơ bản dùng ảnh ghép 2 tư thế", () => {
    for (const name of ["Barbell Squat", "Leg Press", "Bench Press", "Lunge", "Push-up", "Bicep Curl", "Dumbbell Shoulder Press"])
      expect(seed.exercises.find((e) => e.name === name)!.gifUrl, name).toMatch(/^\/exercises\/steps\/.+\.png$/);
  });
});

// ---------- ExerciseMedia ----------

describe("ExerciseMedia", () => {
  it("render <img> tĩnh trong khung 4:3, không có nhãn 'Ảnh động' hay nút tạm dừng", () => {
    const { container } = render(
      <ExerciseMedia src="/exercises/steps/barbell-squat.png" name="Barbell Squat" credit="Everkinetic · CC BY-SA 4.0" />,
    );
    const img = screen.getByRole("img", { name: "Minh hoạ tư thế Barbell Squat" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/exercises/steps/barbell-squat.png");
    expect(img).toHaveClass("object-contain");
    expect(img.parentElement).toHaveClass("aspect-[4/3]");
    // Đang tải: ảnh mờ, skeleton hiện
    expect(img).toHaveClass("opacity-0");
    fireEvent.load(img);
    expect(img).toHaveClass("opacity-100");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ảnh động|tạm dừng/i)).not.toBeInTheDocument();
    expect(container.querySelector("video, canvas")).toBeNull();
    expect(screen.getByText("Ảnh: Everkinetic · CC BY-SA 4.0")).toBeInTheDocument();
  });

  it("lỗi tải hoặc không có src → fallback 'Chưa có ảnh minh hoạ', ẩn credit", () => {
    const { rerender } = render(<ExerciseMedia src="/broken.png" name="X" credit="Everkinetic" />);
    fireEvent.error(screen.getByRole("img", { name: "Minh hoạ tư thế X" }));
    expect(screen.getByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
    expect(screen.queryByText(/Ảnh: Everkinetic/)).not.toBeInTheDocument();

    rerender(<ExerciseMedia key="none" src={null} name="Y" credit={null} />);
    expect(screen.getByText("Chưa có ảnh minh hoạ")).toBeInTheDocument();
  });
});
