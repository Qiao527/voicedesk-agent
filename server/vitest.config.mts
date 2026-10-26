import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Pin the process zone so tests prove we never depend on server-local time.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/scripts/**", "src/index.ts"],
    },
  },
});
