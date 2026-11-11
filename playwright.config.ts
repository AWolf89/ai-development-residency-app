// Playwright config for accessibility scans (ui-accessibility skill template).
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.A11Y_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/a11y",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Scans the production build, which is what users get.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
