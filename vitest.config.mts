import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `server-only` ném lỗi khi bị import ngoài React Server env → thay bằng module rỗng khi test.
      "server-only": fileURLToPath(new URL("./__tests__/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
  },
});
