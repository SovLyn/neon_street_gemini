import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

// Ensure loopback addresses bypass any environment proxy
process.env.NO_PROXY = process.env.NO_PROXY
  ? `${process.env.NO_PROXY},127.0.0.1,localhost`
  : '127.0.0.1,localhost';
process.env.no_proxy = process.env.NO_PROXY;

const isCI = Boolean(process.env.CI);
const localChromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const useLocalChrome = !isCI && fs.existsSync(localChromePath);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: isCI ? 1 : 0,
  workers: 1,
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !isCI,
    timeout: 30000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
    headless: true,
    channel: useLocalChrome ? 'chrome' : undefined,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
});
