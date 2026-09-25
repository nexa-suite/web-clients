import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const proxyConfigPath = resolve(__dirname, '../../platform/proxy.e2e.conf.cjs');

export default defineConfig({
  testDir: '.',
  testMatch: 'portal.spec.ts',
  outputDir: '/tmp/nexa-portal-playwright',
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:4301',
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: `npm run ng -- serve portal --proxy-config "${proxyConfigPath}" --port 4301 --host 127.0.0.1`,
    url: 'http://127.0.0.1:4301/access',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
