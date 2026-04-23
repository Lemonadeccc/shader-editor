import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../test-results/playwright",
  snapshotDir: "./tests/__screenshots__",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:7300",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    channel: "chrome",
  },
  webServer: {
    command: "vp run editor#dev",
    url: "http://127.0.0.1:7300",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 3440, height: 1440 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 991, height: 900 },
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 575, height: 900 },
      },
    },
  ],
});
