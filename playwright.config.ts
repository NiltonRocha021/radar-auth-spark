import { defineConfig, devices } from "@playwright/test";

// Testes E2E rodam contra o dev server local (8080).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    launchOptions: {
      // Ambientes CI/sandbox podem não ter as libs do headless-shell baixado
      // pelo npm; permita apontar para um Chromium do sistema.
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
