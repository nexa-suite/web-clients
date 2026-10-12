import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname);
const baseURL =
  process.env.NEXA_PLATFORM_E2E_BASE_URL ?? "http://localhost:4200";
const browserOrigin = new URL(baseURL);
if (
  browserOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(browserOrigin.hostname) ||
  browserOrigin.port !== "4200"
) {
  throw new Error(
    "NEXA_PLATFORM_E2E_BASE_URL must point to the local Platform app on port 4200.",
  );
}
const portalBaseURL =
  process.env.NEXA_PORTAL_E2E_BASE_URL ?? "http://localhost:4300";
const portalOrigin = new URL(portalBaseURL);
if (
  portalOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(portalOrigin.hostname) ||
  portalOrigin.port !== "4300"
) {
  throw new Error(
    "NEXA_PORTAL_E2E_BASE_URL must point to the local Portal app on port 4300.",
  );
}
const apiCredentials = [
  "NEXA_DEV_WORKSPACE_SLUG",
  "NEXA_DEV_OWNER_EMAIL",
  "NEXA_DEV_OWNER_PASSWORD",
  "NEXA_DEV_TENANT_ADMIN_EMAIL",
  "NEXA_DEV_TENANT_ADMIN_PASSWORD",
  "NEXA_DEV_SALES_EMAIL",
  "NEXA_DEV_SALES_PASSWORD",
  "NEXA_DEV_WAREHOUSE_EMAIL",
  "NEXA_DEV_WAREHOUSE_PASSWORD",
  "NEXA_DEV_LOGISTICS_EMAIL",
  "NEXA_DEV_LOGISTICS_PASSWORD",
  "NEXA_DEV_DEMO_PASSWORD",
  "NEXA_DEV_BUYER_EMAIL",
  "NEXA_DEV_BUYER_PASSWORD",
];
const webServerEnvironment = { ...process.env };
for (const key of apiCredentials) {
  delete webServerEnvironment[key];
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./tooling/playwright/global-setup.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: resolve(projectRoot, "tooling/playwright/test-results"),
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // The browser enters passwords; diagnostic artifacts must never capture form values.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "platform-chromium",
      testMatch: "**/platform/**/*.spec.mjs",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "portal-chromium",
      testMatch: "**/portal/**/*.spec.mjs",
      use: { ...devices["Desktop Chrome"], baseURL: portalBaseURL },
    },
  ],
  webServer: [
    {
      command:
        "npm run ng -- serve platform --configuration development --host 127.0.0.1 --port 4200",
      cwd: projectRoot,
      url: new URL("/sign-in", baseURL).toString(),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: webServerEnvironment,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command:
        "npm run ng -- serve portal --configuration development --host 127.0.0.1 --port 4300",
      cwd: projectRoot,
      url: new URL("/access", portalBaseURL).toString(),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: webServerEnvironment,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
