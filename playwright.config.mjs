import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/browser",
  workers: 1,
  timeout: 60000,
  use: { browserName: "chromium" },
});
