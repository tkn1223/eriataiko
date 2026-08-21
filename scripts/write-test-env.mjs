import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * ローカル Supabase の接続情報から .env.test を作り直す。
 *
 *   npm run test:env
 *
 * Supabase の CLI を上げたときなど、鍵がずれてテストが落ちたら実行する。
 * 本番の値は一切触らない（読むのは supabase status の出力だけ）。
 */

const RAW = '.env.test.raw';

let raw;
try {
  raw = readFileSync(RAW, 'utf8');
} catch {
  console.error(`${RAW} がありません。npm run test:env から実行してください。`);
  process.exit(1);
}

/** @type {Record<string, string>} */
const status = {};
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) status[m[1]] = m[2];
}

const apiUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

if (!apiUrl || !anonKey || !serviceKey) {
  console.error('supabase status の出力から鍵を読み取れませんでした。');
  console.error('npx supabase start が動いているか確認してください。');
  process.exit(1);
}

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(apiUrl)) {
  console.error(`ローカルの Supabase ではありません: ${apiUrl}`);
  console.error('.env.test は本番を指してはいけません。中止します。');
  process.exit(1);
}

const contents = `# テスト専用。ローカル Supabase（npm run db:start）を向いている。
# ここに書いてある鍵は Supabase がローカル用に配っている固定値なので、公開して問題ない。
# 本番の鍵は絶対にここに書かないこと。
#
# 値がずれたら再生成:  npm run test:env

NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey}

# テスト用の固定値。本番とは別のものを使う。
SESSION_SECRET=test-only-session-secret-do-not-use-in-production
TOURNAMENT_PASSCODE=がんばれ2027

# /api/backup の 401 テスト用。Google 側の値は入れないので、
# 正しいヘッダーで叩くところまでは自動テストしない（docs/backup.md の手順で人が確かめる）。
BACKUP_SECRET=test-backup-secret
`;

writeFileSync('.env.test', contents);
unlinkSync(RAW);
console.log('.env.test を更新しました。');
