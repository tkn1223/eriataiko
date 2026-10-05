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

const COLOR_CLASS = /\b(?:bg|text)-(?:team|class)-(?:[1-6]|\$\{)/;
const FOLD = /foldTeamNumber/;
const FIXED_COURTS = /COURT_NUMBERS/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('色の決めごとは 1 か所', () => {
  const files = sourceFiles(SOURCE_ROOT)
    .map((path) => relative(process.cwd(), path))
    .filter((path) => path !== THE_ONE_PLACE);

  test('チーム色・部の色のクラス名は class-labels.ts 以外に書かれていない', () => {
    const copies = files.filter((path) => COLOR_CLASS.test(readFileSync(path, 'utf8')));
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
