import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // ローカル Supabase が生成する一時ファイル。人が書くコードではない。
    'supabase/.temp/**',
    // デザイン担当から受け取った見本（HTML と見本を開くための script）。人が書くコードではない。
    'docs/specs/*/**',
    'test-results/**',
    'playwright-report/**',
  ]),
  {
    rules: {
      // XSS の入口をひとつ潰す。HTML を差し込みたくなったら、まず設計を疑う。
      // eslint-plugin-react は eslint-config-next に同梱されているので追加依存なし。
      'react/no-danger': 'error',
    },
  },
]);

export default eslintConfig;
