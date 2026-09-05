import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadTestEnv } from './tests/load-env.mjs';

const testEnv = loadTestEnv();

/**
 * テストは拡張子で置き場所が決まる。迷わないように 2 種類だけ。
 *
 *   *.test.ts   … ロジック・API・DB    （node で動く。画面は触れない）
 *   *.test.tsx  … 画面の部品           （jsdom で動く。表示やクリックを確かめる）
 *
 * async な Server Component（page.tsx など）は Vitest では動かせない。
 * そこは Playwright（e2e/）で確かめる。
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          // tsconfig の "@/*" を解決する（Vite 8 の標準機能）
          tsconfigPaths: true,
          // 'server-only' はクライアントから import されたら落ちる仕組みなので、
          // テスト（node）からも落ちてしまう。テスト中だけ空にする。
          alias: { 'server-only': new URL('./tests/empty-module.ts', import.meta.url).pathname },
        },
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          env: testEnv,
          // **1 つのデータベースを全ファイルで共有しているので、ファイルは 1 つずつ流す。**
          // 並行で流すと、片方が「いまの大会」を一時的に外している最中に
          // もう片方がそれを当てにして落ちる（実際に tests/schema.test.ts が
          // ときどき落ちた）。playwright.config.ts が workers: 1 なのと同じ理由。
          fileParallelism: false,
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup-ui.ts'],
          env: testEnv,
        },
      },
    ],
  },
});
