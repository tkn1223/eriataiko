import { defineConfig } from '@playwright/test';
import { loadTestEnv } from './tests/load-env.mjs';

const testEnv = loadTestEnv();

/**
 * 画面の動作確認（E2E）。
 *
 * Vitest では async な Server Component を動かせないので、
 * ページ全体の表示・遷移・スマホ幅の崩れはここで確かめる。
 *
 * ポートは 3100。docker compose の 3000 と喧嘩しないように分けている。
 */
export default defineConfig({
  testDir: './e2e',
  // 大会アプリは共有データを触るテストが多いので直列で流す
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    // スマホ幅を実際に再現する。--window-size のような当てにならない指定は使わない。
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    // .env.test の値を実際の環境変数として渡す。
    // 環境変数は .env.local より優先されるので、必ずローカル Supabase を向く。
    env: testEnv,
  },
});
