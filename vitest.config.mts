import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadTestEnv } from './tests/load-env.mjs';

const testEnv = loadTestEnv();

/** 共有の「いまの大会」の印を付け替えるテスト。ほかと同時に流さない */
const TOUCHES_CURRENT_COMPETITION = ['tests/import-competition.test.ts'];

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
          //
          // **fileURLToPath を使う。** URL の pathname は日本語や空白を
          // %E8%A9%A6 のような形に変えてしまい、そんな名前のファイルは無いので
          // 「server-only が見つからない」でテストが 9 本まとめて落ちる
          // （フォルダ名が日本語の作業場所で実際に起きた）。
          alias: {
            'server-only': fileURLToPath(new URL('./tests/empty-module.ts', import.meta.url)),
          },
        },
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...TOUCHES_CURRENT_COMPETITION],
          env: testEnv,
        },
      },
      {
        test: {
          // 「いまの大会」の印（共有）を付け替えるテストだけを、ほかが全部終わってから流す。
          // 同時に流すと、印を読むテスト（schema.test.ts・me.test.ts）が
          // 付け替えの途中を読んで落ちる（PR #53 レビュー指摘3 と同じ競合）
          name: 'current-competition',
          environment: 'node',
          include: [...TOUCHES_CURRENT_COMPETITION],
          env: testEnv,
          sequence: { groupOrder: 1 },
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
