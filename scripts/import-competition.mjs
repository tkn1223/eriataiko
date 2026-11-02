// CSV（大会.csv / 選手.csv / 試合.csv）から大会を取り込む。**書き込む先のデータベースを触る。**
//
// 使い方:
//   node --env-file=.env.local scripts/import-competition.mjs <フォルダ> [--yes]
//   例: node --env-file=.env.test scripts/import-competition.mjs docs/import-sample
//
// 鍵はこのファイルに書かない。環境変数から読む（seed-demo.mjs と同じ）:
//   NEXT_PUBLIC_SUPABASE_URL   … どのデータベースか
//   SUPABASE_SERVICE_ROLE_KEY  … 書き込める鍵（秘密。git に入れない）
//
// 流れ: つなぐ先を表示 → CSV を全部検査（問題があれば全部出して終了。何も書かない）
//       → 件数の要約を表示 → `y` を打つまで待つ（--yes で省略）→ 書き込み
// 説明: docs/import.md
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import {
  FILE_COMPETITION,
  FILE_MATCHES,
  FILE_PLAYERS,
  buildCompetitionPlan,
  summarizePlan,
} from './lib/competition-csv.mjs';
import {
  ImportBlockedError,
  checkImportable,
  createAdminClientFromEnv,
  importCompetition,
} from './lib/import-competition-db.mjs';

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const folder = args.find((arg) => !arg.startsWith('--'));
if (!folder) {
  console.error(
    '使い方: node --env-file=.env.local scripts/import-competition.mjs <フォルダ> [--yes]'
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
// URL を間違えると本番を触る。まず見せる
console.log(`つなぐ先: ${url}\n`);

/** @param {string} name */
const readSheet = (name) => {
  try {
    return readFileSync(join(folder, name), 'utf8');
  } catch {
    console.error(
      `${join(folder, name)} が読めません。フォルダに ${FILE_COMPETITION}・${FILE_PLAYERS}・${FILE_MATCHES} を入れてください。`
    );
    process.exit(1);
  }
};

const { problems, plan } = buildCompetitionPlan({
  competitionCsv: readSheet(FILE_COMPETITION),
  playersCsv: readSheet(FILE_PLAYERS),
  matchesCsv: readSheet(FILE_MATCHES),
});
if (!plan) {
  console.error(
    `CSV に ${problems.length} 件の問題があります。何も書き込んでいません。直してからもう一度実行してください。\n`
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

try {
  const { existingId, blockedReason } = await checkImportable(db, plan);
  console.log('取り込む内容:');
  for (const line of summarizePlan(plan)) console.log(`  ${line}`);
  // 止める理由を先に出す。「消して入れ直します」と言ったあとに止まると、消えたのかと不安になる
  if (blockedReason) {
    console.error(`\n${blockedReason}`);
    process.exit(1);
  }
  console.log(
    existingId
      ? '\n同じ日付の大会が既にあります。大会名を直し、部・チーム・参加・段・試合を消して入れ直します（「いまの大会」の印は残ります）。'
      : '\n新しい大会として作ります（「いまの大会」にはしません。切り替えは set-current-competition.mjs）。'
  );

  if (!skipConfirm) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // 入力が閉じられた（Ctrl+D・パイプの終わり）ときは「やめる」とみなす
    const answer = await Promise.race([
      rl.question(`\n${url} に書き込みます。よければ y を押して Enter: `),
      once(rl, 'close').then(() => ''),
    ]);
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('やめました。何も書き込んでいません。');
      process.exit(0);
    }
  }

  const result = await importCompetition(db, plan);
  console.log(`\n${result.replaced ? '入れ直しました' : '取り込みました'}:`);
  for (const [label, count] of Object.entries(result.counts)) console.log(`  ${label}: ${count}`);

  if (plan.emptySlots.length > 0) {
    console.log(
      '\n空枠として入れたチーム欄（チーム名ではない値）。意図したものか確かめてください:'
    );
    for (const slot of plan.emptySlots) {
      console.log(
        `  ${slot.stage} / ${slot.roundName} の${slot.side === 'a' ? 'チームA' : 'チームB'}: 「${slot.label}」`
      );
    }
  }
} catch (error) {
  if (error instanceof ImportBlockedError) {
    console.error(`\n${error.message}`);
  } else {
    console.error(`\n書き込みの途中で失敗しました: ${error.message}`);
    console.error('もう一度実行してください（丸ごと入れ直すので、やり直しても安全です）。');
  }
  process.exit(1);
}
