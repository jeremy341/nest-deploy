import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/server/test/setup.ts"],
    // Setup hooks create a database and a mock SSH host, which can take a while when
    // every test file runs at once on a busy machine.
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
