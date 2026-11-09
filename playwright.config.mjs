import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173/", ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
  webServer: { command: "node tools/serve.mjs . 4173", url: "http://localhost:4173/", reuseExistingServer: true },
})
