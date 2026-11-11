/**
 * Chạy Playwright E2E trên một Neon branch tạm thời — không ghi rác vào DB chính.
 *
 *   npm run test:e2e              # headless
 *   npm run test:e2e -- --ui      # UI mode (mọi tham số sau `--` được chuyển cho `playwright test`)
 *
 * Luồng: tạo branch `e2e-<timestamp>` (copy-on-write từ branch mặc định) → `drizzle-kit migrate`
 * → seed `exercises` → `playwright test` với DATABASE_URL trỏ vào branch → xoá branch.
 *
 * Cần trong `.env.local` (hoặc env):
 *   NEON_API_KEY      — Neon Console → Account settings → API keys
 *   NEON_PROJECT_ID   — tuỳ chọn; nếu thiếu sẽ tự dò project chứa endpoint trong DATABASE_URL
 *   NEON_ORG_ID       — tuỳ chọn; nếu thiếu sẽ lấy từ /users/me/organizations
 *   E2E_KEEP_BRANCH=1 — tuỳ chọn; giữ lại branch sau khi chạy để debug
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";

config({ path: ".env.local", quiet: true });

const API = "https://console.neon.tech/api/v2";
const apiKey = process.env.NEON_API_KEY;

type Operation = { id: string; status: string };

async function neon<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Neon API ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Dò project chứa endpoint của DATABASE_URL (vd. host `ep-xxx-pooler.region.aws.neon.tech`). */
async function resolveProjectId(): Promise<string> {
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu NEON_PROJECT_ID và DATABASE_URL để dò project.");
  const endpointId = new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");

  // Tài khoản thuộc organization bắt buộc truyền org_id khi liệt kê project.
  const orgIds = process.env.NEON_ORG_ID
    ? [process.env.NEON_ORG_ID]
    : (await neon<{ organizations: { id: string }[] }>("/users/me/organizations")).organizations.map((o) => o.id);
  const queries = orgIds.length ? orgIds.map((id) => `?limit=100&org_id=${id}`) : ["?limit=100"];

  const projects: { id: string }[] = [];
  for (const q of queries) projects.push(...(await neon<{ projects: { id: string }[] }>(`/projects${q}`)).projects);

  for (const p of projects) {
    const { endpoints } = await neon<{ endpoints: { id: string }[] }>(`/projects/${p.id}/endpoints`);
    if (endpoints.some((e) => e.id === endpointId)) return p.id;
  }
  throw new Error(`Không tìm thấy project chứa endpoint ${endpointId}. Hãy đặt NEON_PROJECT_ID.`);
}

async function waitForOperations(projectId: string, ops: Operation[]) {
  for (const op of ops) {
    for (let i = 0; i < 60; i++) {
      const { operation } = await neon<{ operation: Operation }>(`/projects/${projectId}/operations/${op.id}`);
      if (operation.status === "finished" || operation.status === "skipped") break;
      if (operation.status === "failed" || operation.status === "error")
        throw new Error(`Neon operation ${op.id} thất bại.`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (!apiKey) {
    console.error(
      "✗ Thiếu NEON_API_KEY. Thêm vào .env.local (Neon Console → Account settings → API keys).\n" +
        "  E2E từ chối chạy trên DATABASE_URL chính để không ghi rác vào production.",
    );
    process.exit(1);
  }

  const projectId = await resolveProjectId();
  const name = `e2e-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`▶ Tạo Neon branch ${name} (project ${projectId})…`);
  const created = await neon<{
    branch: { id: string };
    operations: Operation[];
    connection_uris?: { connection_uri: string }[];
  }>(`/projects/${projectId}/branches`, {
    method: "POST",
    body: JSON.stringify({ branch: { name }, endpoints: [{ type: "read_write" }] }),
  });
  const branchId = created.branch.id;
  const databaseUrl = created.connection_uris?.[0]?.connection_uri;

  let exitCode = 1;
  const cleanup = async () => {
    if (process.env.E2E_KEEP_BRANCH === "1") {
      console.log(`ℹ Giữ lại branch ${name} (${branchId}) theo E2E_KEEP_BRANCH=1.`);
      return;
    }
    console.log(`▶ Xoá Neon branch ${name}…`);
    await neon(`/projects/${projectId}/branches/${branchId}`, { method: "DELETE" }).catch((err) =>
      console.error(`✗ Không xoá được branch ${branchId}: ${err}`),
    );
  };
  process.once("SIGINT", () => void cleanup().finally(() => process.exit(130)));

  try {
    if (!databaseUrl) throw new Error("Neon không trả về connection_uri cho branch mới.");
    await waitForOperations(projectId, created.operations);

    const env = { ...process.env, DATABASE_URL: databaseUrl, E2E_DB_BRANCH: name };

    console.log("▶ Migrate + seed branch…");
    if ((await run("npx", ["drizzle-kit", "migrate"], env)) !== 0) throw new Error("drizzle-kit migrate thất bại.");
    if ((await run("npx", ["tsx", "scripts/seed-exercises.ts"], env)) !== 0) throw new Error("Seed thất bại.");

    console.log("▶ Playwright…");
    exitCode = await run("npx", ["playwright", "test", ...process.argv.slice(2)], env);
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : err}`);
  } finally {
    await cleanup();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
