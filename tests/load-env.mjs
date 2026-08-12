import { readFileSync } from 'node:fs';

/**
 * テストが読む環境変数は **.env.test だけ**。
 *
 * .env.local には本番の鍵が入りうるので、意図的に読み込まない。
 * これがテストから本番 DB を触ってしまう事故を防ぐ仕組み。
 * （Vite の loadEnv は .env.local も拾ってしまうので使わない）
 *
 * 設定ファイル（vitest / playwright）の両方から読むので、
 * TypeScript ではなく素の JavaScript で書いてある。
 *
 * @returns {Record<string, string>}
 */
export function loadTestEnv() {
  /** @type {string} */
  let text;
  try {
    text = readFileSync('.env.test', 'utf8');
  } catch {
    throw new Error(
      '.env.test が見つかりません。\n' +
        'ローカル Supabase を起動してから値を書き出してください:\n' +
        '  npx supabase start\n' +
        '  npm run test:env'
    );
  }

  /** @type {Record<string, string>} */
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 前後のクォートだけ外す
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
