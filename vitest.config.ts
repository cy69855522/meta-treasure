import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@progress/deep-research": path.resolve(
        __dirname,
        "./package/deep_research/src",
      ),
    },
  },
});
