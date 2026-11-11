/**
 * Dựng ảnh TĨNH minh hoạ bài tập: 2 tư thế "Bắt đầu" và "Kết thúc" đặt cạnh nhau trên 1 ảnh PNG 4:3.
 *
 * Nguồn:
 * - Everkinetic (https://github.com/everkinetic/data, CC BY-SA 4.0): mỗi bài có 2 SVG cùng canvas —
 *   "relaxation" (tư thế bắt đầu) và "tension" (tư thế gắng sức / kết thúc).
 * - Cặp ảnh PNG trên wger.de (CC BY-SA 3.0) cho các bài Everkinetic không có SVG.
 *
 * Bố cục: canvas cố định 1200×900 (khớp khung 4:3 của modal → ảnh lấp đầy khung, không viền thừa).
 * Hai tư thế xếp ngang hoặc dọc — chọn cách cho hình người to hơn (bài nằm như Bench Press xếp dọc).
 * Tư thế Everkinetic cắt theo hộp bao chung của 2 khung → hình không bị lệch vị trí giữa 2 panel.
 *
 * Chạy: npm run assets:images   (cần mạng; sau đó `npm run db:seed` để cập nhật DB)
 * Giấy phép: ảnh ghép là tác phẩm phái sinh → giữ CC BY-SA + ghi nguồn (trong imageCredit).
 * Mỗi mapping đã được kiểm tra bằng mắt là khớp động tác trong hướng dẫn của app.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp, { type OutputInfo, type OverlayOptions } from "sharp";

type Source =
  /** `startTension`: tư thế bắt đầu là khung "tension" (bài bắt đầu ở vị trí trên: squat, đẩy ngực…). */
  | { kind: "everkinetic"; id: string; startTension?: boolean }
  | { kind: "pair"; start: string; end: string; credit: string };

const WGER = "https://wger.de/media/exercise-images";

/** Tên bài trong seed → nguồn 2 tư thế. */
const SOURCES: Record<string, Source> = {
  "Barbell Squat": { kind: "everkinetic", id: "0122", startTension: true },
  "Leg Press": { kind: "everkinetic", id: "0127", startTension: true },
  "Lying Leg Curl": { kind: "everkinetic", id: "0117" },
  "Seated Leg Curl": { kind: "everkinetic", id: "0119" },
  Lunge: { kind: "everkinetic", id: "0115" },
  "Bench Press": { kind: "everkinetic", id: "0042", startTension: true },
  "Seated Cable Row": { kind: "everkinetic", id: "0025" },
  "Lateral Raise": { kind: "everkinetic", id: "0018" },
  "Push-up": { kind: "everkinetic", id: "0077", startTension: true },
  "Hip Abduction": { kind: "everkinetic", id: "0156" },
  "Leg Extension": { kind: "everkinetic", id: "0142" },
  "Machine Chest Press": { kind: "everkinetic", id: "0066" },
  "Bicep Curl": { kind: "everkinetic", id: "0224" },
  "Tricep Extension": { kind: "everkinetic", id: "0206" },
  "Step-up": { kind: "everkinetic", id: "0137" },
  "Cable Kickback": { kind: "everkinetic", id: "0112" },
  "Good Morning": { kind: "everkinetic", id: "0101" },
  "Incline Dumbbell Press": { kind: "everkinetic", id: "0061" },
  "Hammer Curl": { kind: "everkinetic", id: "0227" },
  "Sumo Squat": { kind: "everkinetic", id: "0152", startTension: true },
  "One-arm Dumbbell Row": { kind: "everkinetic", id: "0024" },
  "Overhead Dumbbell Tricep Extension": { kind: "everkinetic", id: "0198", startTension: true },
  "Romanian Deadlift (RDL)": { kind: "everkinetic", id: "0118", startTension: true },
  "Dumbbell Shoulder Press": {
    kind: "pair",
    start: `${WGER}/123/dumbbell-shoulder-press-large-1.png`,
    end: `${WGER}/123/dumbbell-shoulder-press-large-2.png`,
    credit: "Everkinetic · wger.de · CC BY-SA 3.0 (ghép 2 tư thế)",
  },
  "Machine Shoulder Press": {
    kind: "pair",
    start: `${WGER}/53/Shoulder-press-machine-2.png`,
    end: `${WGER}/53/Shoulder-press-machine-1.png`,
    credit: "wger.de · CC BY-SA 3.0 (ghép 2 tư thế)",
  },
};

const EVERKINETIC = "https://raw.githubusercontent.com/everkinetic/data/main/dist/svg";
const EVERKINETIC_CREDIT = "Everkinetic · CC BY-SA 4.0 (ghép 2 tư thế)";
const OUT_DIR = resolve(process.cwd(), "public/exercises/steps");
const SEED_FILE = resolve(process.cwd(), "src/db/seed/exercises.json");

const W = 1200, H = 900; // 4:3, đủ nét trên màn hình 3x (modal rộng ~400 CSS px)
const MARGIN = 28;
const LABEL_H = 64; // dải nhãn phía trên mỗi panel
const RENDER_WIDTH = 1400;
const LABELS = ["1 · Bắt đầu", "2 · Kết thúc"] as const;

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function download(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Ảnh nguồn → raw greyscale nền trắng, rộng RENDER_WIDTH (SVG rasterize đúng độ nét, PNG phóng/thu). */
async function toGrey(input: Buffer, isSvg: boolean) {
  let img = sharp(input);
  if (isSvg) {
    const { width = 300 } = await img.metadata();
    img = sharp(input, { density: Math.ceil((72 * RENDER_WIDTH) / width) });
  }
  return img
    .resize({ width: RENDER_WIDTH })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .linear(255 / 235, 0) // nền gần trắng (vd. #f2 của vài PNG wger) → trắng tuyệt đối, nét đen giữ nguyên
    .raw()
    .toBuffer({ resolveWithObject: true });
}

type Raw = Awaited<ReturnType<typeof toGrey>>;

/** Hộp bao vùng có nét (pixel tối hơn ngưỡng) của các khung cùng kích thước. */
function inkBBox(frames: Raw[]) {
  const { width, height } = frames[0].info;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (const { data } of frames)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[y * width + x] < 200) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
  if (x1 < x0) throw new Error("Ảnh trống");
  const pad = 8;
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  return { left, top, width: Math.min(width, x1 + pad + 1) - left, height: Math.min(height, y1 + pad + 1) - top };
}

/** Cắt viền trắng. Hai khung cùng canvas (Everkinetic) → dùng hộp bao chung để hình không lệch. */
async function cropPoses(a: Raw, b: Raw) {
  const sameCanvas = a.info.width === b.info.width && a.info.height === b.info.height;
  const crop = (r: Raw, box: ReturnType<typeof inkBBox>) =>
    sharp(r.data, { raw: { width: r.info.width, height: r.info.height, channels: 1 } })
      .extract(box)
      .png()
      .toBuffer({ resolveWithObject: true });
  if (sameCanvas) {
    const box = inkBBox([a, b]);
    return Promise.all([crop(a, box), crop(b, box)]);
  }
  return Promise.all([crop(a, inkBBox([a])), crop(b, inkBBox([b]))]);
}

/** Tỉ lệ thu phóng để 2 hình (rộng w, cao h) vừa ô cellW × cellH. */
const fitScale = (w: number, h: number, cellW: number, cellH: number) => Math.min(cellW / w, cellH / h);

async function compose(poses: { data: Buffer; info: OutputInfo }[]) {
  const w = Math.max(...poses.map((p) => p.info.width));
  const h = Math.max(...poses.map((p) => p.info.height));

  // Ngang: 2 ô cạnh nhau. Dọc: 2 ô chồng nhau. Chọn cách cho hình to hơn.
  const hCell = { w: (W - 3 * MARGIN) / 2, h: H - 2 * MARGIN - LABEL_H };
  const vCell = { w: W - 2 * MARGIN, h: (H - 3 * MARGIN) / 2 - LABEL_H };
  const horizontal = fitScale(w, h, hCell.w, hCell.h) >= fitScale(w, h, vCell.w, vCell.h);
  const cell = horizontal ? hCell : vCell;

  const layers: OverlayOptions[] = [];
  const labels: string[] = [];
  for (let i = 0; i < 2; i++) {
    const x = horizontal ? MARGIN + i * (cell.w + MARGIN) : MARGIN;
    const y = horizontal ? MARGIN : MARGIN + i * (cell.h + LABEL_H + MARGIN);
    const img = await sharp(poses[i].data)
      .resize({ width: Math.floor(cell.w), height: Math.floor(cell.h), fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push({
      input: img.data,
      left: Math.round(x + (cell.w - img.info.width) / 2),
      top: Math.round(y + LABEL_H + (cell.h - img.info.height) / 2),
    });
    const fill = i === 0 ? "#0f766e" : "#c2410c"; // teal = bắt đầu, cam = kết thúc
    labels.push(
      `<rect x="${x}" y="${y + 6}" width="${cell.w}" height="${LABEL_H - 12}" rx="${(LABEL_H - 12) / 2}" fill="${fill}" fill-opacity="0.1"/>` +
        `<text x="${x + cell.w / 2}" y="${y + LABEL_H / 2 + 11}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="${fill}">${LABELS[i]}</text>`,
    );
  }
  // Mũi tên chỉ hướng chuyển động giữa 2 panel
  const arrow = horizontal
    ? `<text x="${W / 2}" y="${H / 2 + 16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="#a1a1aa">›</text>`
    : "";
  const divider = horizontal
    ? `<line x1="${W / 2}" y1="${MARGIN + LABEL_H}" x2="${W / 2}" y2="${H / 2 - 40}" stroke="#e4e4e7" stroke-width="2"/>` +
      `<line x1="${W / 2}" y1="${H / 2 + 40}" x2="${W / 2}" y2="${H - MARGIN}" stroke="#e4e4e7" stroke-width="2"/>`
    : `<line x1="${MARGIN}" y1="${H / 2}" x2="${W - MARGIN}" y2="${H / 2}" stroke="#e4e4e7" stroke-width="2"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${divider}${arrow}${labels.join("")}</svg>`;
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });

  const png = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite(layers)
    .png({ palette: true, colours: 64, effort: 10, dither: 0.5 })
    .toBuffer();
  return { png, horizontal };
}

async function build(source: Source) {
  const [startBuf, endBuf] =
    source.kind === "everkinetic"
      ? await Promise.all(
          (source.startTension ? ["tension", "relaxation"] : ["relaxation", "tension"]).map((p) =>
            download(`${EVERKINETIC}/${source.id}-${p}.svg`),
          ),
        )
      : await Promise.all([download(source.start), download(source.end)]);
  const isSvg = source.kind === "everkinetic";
  const [a, b] = await Promise.all([toGrey(startBuf, isSvg), toGrey(endBuf, isSvg)]);
  const poses = await cropPoses(a, b);
  const { png, horizontal } = await compose(poses);
  return { png, horizontal, credit: source.kind === "everkinetic" ? EVERKINETIC_CREDIT : source.credit };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as {
    exercises: { name: string; gifUrl: string | null; imageCredit: string | null }[];
  };

  let total = 0;
  for (const [name, source] of Object.entries(SOURCES)) {
    const exercise = seed.exercises.find((e) => e.name === name);
    if (!exercise) throw new Error(`Không có bài "${name}" trong exercises.json`);

    const { png, horizontal, credit } = await build(source);
    const file = `${slugify(name)}.png`;
    writeFileSync(resolve(OUT_DIR, file), png);
    exercise.gifUrl = `/exercises/steps/${file}`;
    exercise.imageCredit = credit;
    total += png.length;
    const from = source.kind === "everkinetic" ? source.id : "wger";
    console.log(`✓ ${name.padEnd(36)} ← ${from.padEnd(6)} ${horizontal ? "ngang" : "dọc  "} ${(png.length / 1024).toFixed(0)} KB`);
  }

  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2) + "\n");
  console.log(`\n${Object.keys(SOURCES).length} ảnh · tổng ${(total / 1024).toFixed(0)} KB → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
