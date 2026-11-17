import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PORT = 3100;
const dbDir = path.join(os.tmpdir(), `lmi-e2e-${Date.now()}`);

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    // 環境にプリインストール済みの Chromium を使う（未設定なら Playwright 既定）
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /flow\.spec\.ts/ },
    { name: "ipad", use: { ...devices["iPad Pro 11"], browserName: "chromium" }, testMatch: /layout\.spec\.ts/, dependencies: ["iphone"] },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120000,
    env: { APP_PASSWORD: "e2e-password", SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123", PGLITE_DIR: dbDir, NODE_ENV: "production" },
  },
});
