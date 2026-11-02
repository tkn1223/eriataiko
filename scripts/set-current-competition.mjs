// 「いまの大会」の印を、指定した日付の大会に移す。**書き込む先のデータベースを触る。**
//
// 使い方:
//   node --env-file=.env.local scripts/set-current-competition.mjs <日付 YYYY-MM-DD> [--yes]
//
// その日付の大会がちょうど 1 つでなければ止まる。印は常に 1 つだけ（外す → 付ける）。
import { once } from 'node:events';
import { createInterface } from 'node:readline/promises';
import { createAdminClientFromEnv, setCurrentCompetition } from './lib/import-competition-db.mjs';

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const heldOn = args.find((arg) => !arg.startsWith('--'));
if (!heldOn || !/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
  console.error(
    '使い方: node --env-file=.env.local scripts/set-current-competition.mjs <日付 YYYY-MM-DD> [--yes]'
  );
  process.exit(1);
}

let client;
try {
  client = createAdminClientFromEnv(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { url, db } = client;
console.log(`つなぐ先: ${url}\n`);

try {
  if (!skipConfirm) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // 入力が閉じられた（Ctrl+D・パイプの終わり）ときは「やめる」とみなす
    const answer = await Promise.race([
      rl.question(`${heldOn} の大会を「いまの大会」にします。よければ y を押して Enter: `),
      once(rl, 'close').then(() => ''),
    ]);
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('やめました。何も変えていません。');
      process.exit(0);
    }
  }
  const target = await setCurrentCompetition(db, heldOn);
  console.log(`「いまの大会」を「${target.name}」（${heldOn}）にしました。`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
