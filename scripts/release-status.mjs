import { execSync } from 'node:child_process';

/**
 * いま「出し忘れ」が無いかを 1 コマンドで見る。
 *
 *   npm run release:status
 *
 * 見ているのは **ファイルの中身** で、コミットの並びではない。
 * develop → main はマージコミットで入れているので、コミットの並びは
 * リリースのたびに 1 つずつずれていく。それは害が無いので気にしない。
 */

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

run('git fetch --quiet origin');

const diff = run('git diff --stat origin/main origin/develop');
const behind = run('git log origin/develop..origin/main --oneline --no-merges');

console.log('■ main に出していない変更');
if (diff === '') {
  console.log('  なし。develop の中身は main に入っています。');
} else {
  console.log(diff.replace(/^/gm, '  '));
  console.log('');
  console.log('  → develop → main の PR を作ってください。');
}

console.log('');
console.log('■ main にだけある変更（あってはいけない）');
if (behind === '') {
  console.log('  なし。');
} else {
  console.log(behind.replace(/^/gm, '  '));
  console.log('');
  console.log('  → main に直接コミットしています。develop に取り込んでください:');
  console.log('     git switch develop && git merge origin/main');
}

// 中身が同じでも、公開していなければサイトは古いまま。そこは git では分からないので
// 最後に必ず思い出させる。
console.log('');
console.log('■ 忘れやすいこと');
console.log('  マージしただけではサイトは変わりません。');
console.log('  Actions の「公開する」を main から押して初めて反映されます。');
console.log('  （.github/ や docs/ だけの変更なら公開は不要）');
