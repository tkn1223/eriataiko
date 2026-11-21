import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * チームの色・部の色の対応表が `src/domain/class-labels.ts` の 1 か所だけにあることを、
 * ソースを読んで機械で見張る。
 *
 * 画面ごとにコピーされて食い違った（5 チーム目の扱いが 2 通り、扱える部の数が 3 と 6 の 2 通り）
 * ことがあるので、また誰かが `bg-team-1` を別の場所に書いたらここで落ちる。
 * Tailwind はクラス名を文字列で探すので、`bg-team-${n}` のような組み立ても同じ理由で禁止
 * （色が付かなくなる）。テストファイルは「この色になっているか」を確かめるために書いてよい。
 */
const SOURCE_ROOT = join(process.cwd(), 'src');
const THE_ONE_PLACE = join('src', 'domain', 'class-labels.ts');

/**
 * チーム色・部の色を指す書き方。`bg-` `text-` だけでなく `border-` `ring-` など
 * どの頭でも、CSS の変数（`var(--color-team-1)`）でも、`'bg-team-' + n` のような
 * つなぎ合わせでも引っかかるようにする（どれも対応表のコピーになる）。
 */
const COLOR_CLASS = /-(?:team|class)-(?:\d|\$\{)|-(?:team|class)-['"`]\s*\+/;
const FOLD = /foldTeamNumber/;
const FIXED_COURTS = /COURT_NUMBERS/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * 見張る中身。CSS は、色の値そのものを決める行（`--color-team-1: #c82929;` のような @theme の変数の定義）だけ外す。
 * 定義は globals.css にしか置けないので外してよいが、`.foo { color: var(--color-team-1) }` のような
 * 部品クラスで色を当てると、class-labels.ts を通らない抜け道になるので見張る。
 */
function watchedSource(path: string): string {
  const source = readFileSync(path, 'utf8');
  if (!path.endsWith('.css')) return source;
  return source
    .split('\n')
    .filter((line) => !/^\s*--color-[\w-]+\s*:/.test(line))
    .join('\n');
}

describe('見張りの網に穴が無い', () => {
  test.each([
    'bg-team-1',
    'text-team-2',
    'border-team-3',
    'ring-class-4',
    'bg-class-5-bg',
    'text-class-6',
    'var(--color-team-1)',
    'bg-team-${teamNumber}',
    "'bg-class-' + colorNumber",
  ])('%s は対応表のコピーとして見つかる', (source) => {
    expect(COLOR_CLASS.test(source)).toBe(true);
  });

  test.each(['teamBgClass(team.number)', 'classColorClasses(1).dot', "data-testid='team'"])(
    '%s は見つからない（共通の関数を呼んでいるだけ）',
    (source) => {
      expect(COLOR_CLASS.test(source)).toBe(false);
    }
  );
});

describe('色の決めごとは 1 か所', () => {
  const files = sourceFiles(SOURCE_ROOT)
    .map((path) => relative(process.cwd(), path))
    .filter((path) => path !== THE_ONE_PLACE);

  test('globals.css も見張りの対象に入っている（部品クラスからの抜け道をふさぐ）', () => {
    expect(files).toContain(join('src', 'app', 'globals.css'));
  });

  test('CSS の変数の定義の行は外し、それ以外で色を指していれば見つかる', () => {
    const lines = ['  --color-team-1: #c82929;', '.foo { color: var(--color-team-1); }'];
    const kept = lines.filter((line) => !/^\s*--color-[\w-]+\s*:/.test(line));
    expect(kept).toEqual(['.foo { color: var(--color-team-1); }']);
    expect(COLOR_CLASS.test(kept.join('\n'))).toBe(true);
  });

  test('チーム色・部の色のクラス名は class-labels.ts 以外に書かれていない', () => {
    const copies = files.filter((path) => COLOR_CLASS.test(watchedSource(path)));
    expect(copies).toEqual([]);
  });

  test('foldTeamNumber はどこにも残っていない', () => {
    const left = files.filter((path) => FOLD.test(readFileSync(path, 'utf8')));
    expect(left).toEqual([]);
  });

  test('コートの枚数の決め打ち（COURT_NUMBERS）はどこにも残っていない', () => {
    const left = files.filter((path) => FIXED_COURTS.test(readFileSync(path, 'utf8')));
    expect(left).toEqual([]);
  });

  test('class-labels.ts 自身には、チーム 1〜4・部 1〜6 の完全なクラス名が書かれている', () => {
    const source = readFileSync(join(process.cwd(), THE_ONE_PLACE), 'utf8');
    for (const n of [1, 2, 3, 4]) expect(source).toContain(`'bg-team-${n}'`);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(source).toContain(`'text-class-${n}'`);
      expect(source).toContain(`'bg-class-${n}-bg'`);
      expect(source).toContain(`'bg-class-${n}'`);
    }
  });
});
