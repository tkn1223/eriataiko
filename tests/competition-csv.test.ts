import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildCompetitionPlan, parseCsv } from '../scripts/lib/competition-csv.mjs';

/**
 * CSV 取り込みの「読む・検査する・組み立てる」部分（DB を触らない）。
 * 仕様: docs/specs/2026-10-11-csv-import.md
 */

const read = (name: string) => readFileSync(`docs/import-sample/${name}.csv`, 'utf8');
const sample = { competitionCsv: read('大会'), playersCsv: read('選手'), matchesCsv: read('試合') };

type Sheets = typeof sample;

/** 見本の 3 枚のうち 1 枚の文字列を差し替えて検査にかける */
function check(edit: Partial<Record<keyof Sheets, (text: string) => string>>) {
  const sheets = { ...sample };
  for (const key of Object.keys(edit) as (keyof Sheets)[]) sheets[key] = edit[key]!(sheets[key]);
  return buildCompetitionPlan(sheets);
}

const replaceOnce = (from: string, to: string) => (text: string) => {
  if (!text.includes(from)) throw new Error(`見本に「${from}」が無い`);
  return text.replace(from, to);
};
/** 行ごとに差し替える（行番号は 1 始まり） */
const editLine = (lineNumber: number, edit: (line: string) => string) => (text: string) =>
  text
    .split('\n')
    .map((line, index) => (index + 1 === lineNumber ? edit(line) : line))
    .join('\n');
const appendLine = (line: string) => (text: string) => text.trimEnd() + '\n' + line + '\n';

describe('CSV の読み取り', () => {
  test('引用符・引用符の中の改行と "" ・CRLF・先頭の BOM を読める', () => {
    const { rows } = parseCsv('﻿a,b\r\n"x,1","改行\nあり ""引用"""\r\n');
    expect(rows.map((row) => row.cells)).toEqual([
      ['a', 'b'],
      ['x,1', '改行\nあり "引用"'],
    ]);
  });

  test('行番号は物理的な行（引用符の中の改行も数える）。空行は飛ばす', () => {
    const { rows } = parseCsv('a\n\n"x\ny"\nz\n');
    expect(rows.map((row) => row.line)).toEqual([1, 3, 5]);
  });

  test('閉じていない引用符を知らせる', () => {
    expect(parseCsv('a,"b\nc').unclosedQuoteLine).toBe(1);
  });
});

describe('見本の 3 枚', () => {
  test('そのまま通る', () => {
    const { problems } = check({});
    expect(problems).toEqual([]);
  });

  test('組み立て: 4 チーム・3 部・予選 6 対戦・決勝 4 対戦・試合 30 本', () => {
    const { plan } = check({});
    expect(plan!.teams).toHaveLength(4);
    expect(plan!.divisions).toHaveLength(3);
    const byStage = (stage: string) => plan!.matchups.filter((m) => m.stage === stage);
    expect(byStage('予選リーグ')).toHaveLength(6);
    expect(byStage('決勝トーナメント')).toHaveLength(4);
    expect(plan!.matchups.flatMap((m) => m.matches)).toHaveLength(30);
  });

  test('組み立て: 試合の max_game_count は大会.csv の「段/部」のゲーム数', () => {
    const { plan } = check({});
    const gameCountOf = (stage: string) => [
      ...new Set(
        plan!.matchups
          .filter((m) => m.stage === stage)
          .flatMap((m) => m.matches.map((x) => x.maxGameCount))
      ),
    ];
    expect(gameCountOf('予選リーグ')).toEqual([1]);
    expect(gameCountOf('決勝トーナメント')).toEqual([3]);
  });

  test('組み立て: 決勝の「予選1位」などは空枠になり、一覧で知らせる', () => {
    const { plan } = check({});
    expect(new Set(plan!.emptySlots.map((slot) => slot.label))).toEqual(
      new Set([
        '予選1位',
        '予選4位',
        '予選2位',
        '予選3位',
        '準決勝1勝者',
        '準決勝2勝者',
        '準決勝1敗者',
        '準決勝2敗者',
      ])
    );
    const final = plan!.matchups.find((m) => m.roundName === '決勝')!;
    expect(final.sideATeam).toBeNull();
    expect(final.sideASlotLabel).toBe('準決勝1勝者');
  });

  test('組み立て: 決勝トーナメントの出場者は空のまま入る', () => {
    const { plan } = check({});
    const semifinal = plan!.matchups.find((m) => m.roundName === '準決勝1')!;
    expect(semifinal.matches.every((m) => m.sideA.length === 0 && m.sideB.length === 0)).toBe(true);
  });
});

describe('検査: 大会.csv', () => {
  test('必須の列が無い', () => {
    const { problems } = check({ competitionCsv: (t) => t.replace('種類,名前,値', '種類,名前') });
    expect(problems.join('\n')).toContain('大会.csv');
    expect(problems.join('\n')).toContain('「値」');
  });

  test('知らない種類は行番号つきで止まる', () => {
    const { problems } = check({ competitionCsv: appendLine('せっかち,x,1') });
    expect(problems.join('\n')).toContain('大会.csv 20行目: 知らない種類「せっかち」です');
  });

  test('日付の形が違う', () => {
    const { problems } = check({ competitionCsv: replaceOnce('2026-11-23', '2026/11/23') });
    expect(problems.join('\n')).toContain('大会.csv 2行目');
    expect(problems.join('\n')).toContain('日付');
  });

  test('存在しない日付（2 月 30 日）も止める', () => {
    const { problems } = check({ competitionCsv: replaceOnce('2026-11-23', '2026-02-30') });
    expect(problems.join('\n')).toContain('大会.csv 2行目');
  });

  test('チーム番号が 1〜4 でない', () => {
    const { problems } = check({
      competitionCsv: replaceOnce('チーム,うみかぜ,4', 'チーム,うみかぜ,5'),
    });
    expect(problems.join('\n')).toMatch(/大会\.csv 8行目.*1〜4/);
  });

  test('チーム番号が重なる', () => {
    const { problems } = check({
      competitionCsv: replaceOnce('チーム,うみかぜ,4', 'チーム,うみかぜ,3'),
    });
    expect(problems.join('\n')).toMatch(/大会\.csv 8行目.*重なって/);
  });

  test('チーム・部・段の名前が重なる', () => {
    const { problems } = check({
      competitionCsv: (t) =>
        appendLine('部,1部,')(
          appendLine('段,予選リーグ,リーグ')(appendLine('チーム,あおぞら,3')(t))
        ),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/チーム「あおぞら」/);
    expect(text).toMatch(/部「1部」/);
    expect(text).toMatch(/段「予選リーグ」/);
  });

  test('ゲーム数: 知らない段／部、1 以上の整数でない、足りない', () => {
    const { problems } = check({
      competitionCsv: (t) =>
        appendLine('ゲーム数,ひみつ/1部,1')(
          appendLine('ゲーム数,予選リーグ/ひみつ,1')(
            replaceOnce(
              'ゲーム数,予選リーグ/1部,1',
              'ゲーム数,予選リーグ/1部,0'
            )(replaceOnce('ゲーム数,決勝トーナメント/3部,3\n', '')(t))
          )
        ),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/大会\.csv 14行目.*1 以上の整数/);
    expect(text).toMatch(/段「ひみつ」/);
    expect(text).toMatch(/部「ひみつ」/);
    expect(text).toMatch(/試合\.csv.*決勝トーナメント\/3部/);
  });
});

describe('検査: 面数', () => {
  test('今年の面数が会場の面数より多ければ止める', () => {
    const { problems, plan } = check({ competitionCsv: replaceOnce('面数,,9', '面数,,10') });
    expect(plan).toBeNull();
    expect(problems.join('\n')).toMatch(/大会\.csv 4行目.*面数.*10.*会場.*9/);
  });
});

describe('検査: 選手.csv', () => {
  test('選手番号の重なり・整数でない', () => {
    const { problems } = check({
      playersCsv: (t) => appendLine('5001,ダブり,あおぞら,1部')(appendLine('abc,ばつ,,')(t)),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/選手\.csv 27行目.*整数/);
    expect(text).toMatch(/選手\.csv 28行目.*5001.*重なって/);
  });

  test('知らないチーム・部', () => {
    const { problems } = check({
      playersCsv: appendLine('5100,たろう,まぼろし,ひみつ部'),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/選手\.csv 27行目.*チーム「まぼろし」/);
    expect(text).toMatch(/選手\.csv 27行目.*部「ひみつ部」/);
  });

  test('名前が空', () => {
    const { problems } = check({ playersCsv: appendLine('5100,,,') });
    expect(problems.join('\n')).toMatch(/選手\.csv 27行目.*名前/);
  });
});

describe('検査: 試合.csv', () => {
  test('知らない段・部', () => {
    const { problems } = check({
      matchesCsv: editLine(2, (l) => l.replace('予選リーグ', 'ひみつ').replace(',1部,', ',9部,')),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/試合\.csv 2行目.*段「ひみつ」/);
    expect(text).toMatch(/試合\.csv 2行目.*部「9部」/);
  });

  test('リーグの段で知らないチーム名は止める（トーナメントなら空枠）', () => {
    const { problems } = check({
      matchesCsv: editLine(2, (l) => l.replace('あおぞら', 'まぼろし')),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*チーム「まぼろし」/);
  });

  test('同じ対戦の中でチームA/B・対戦の順番が食い違う', () => {
    const { problems } = check({
      matchesCsv: editLine(3, (l) =>
        l.replace('あおぞら,もみじ', 'あおぞら,さくら').replace(',1,', ',9,')
      ),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/試合\.csv 3行目.*2行目.*チームB/);
    expect(text).toMatch(/試合\.csv 3行目.*2行目.*対戦の順番/);
  });

  test('チームAとBが同じ', () => {
    const { problems } = check({
      matchesCsv: (t) =>
        t
          .split('\n')
          .map((l) =>
            l.startsWith('予選リーグ,予選 第1試合') ? l.replace('もみじ', 'あおぞら') : l
          )
          .join('\n'),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*同じ/);
  });

  test('コートが 1〜面数 の整数でない', () => {
    const { problems } = check({
      matchesCsv: editLine(2, (l) => l.replace(',1,1,5001', ',10,1,5001')),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*コート.*1〜9/);
  });

  test('コートの中の順番が1 以上の整数でない／同じコートで重なる', () => {
    const { problems } = check({
      matchesCsv: editLine(3, (l) => l.replace(',2,2,1,5003', ',2,2,0,5003')),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 3行目.*コートの中の順番/);
    const dup = check({ matchesCsv: editLine(5, (l) => l.replace(',1,2,5001', ',1,1,5001')) });
    // 5 行目 = 2 つ目の対戦の 1 部（コート 1・順番 2）→ 1 つ目と同じ順番にする
    expect(dup.problems.join('\n')).toMatch(/試合\.csv 5行目.*重なって/);
  });

  test('選手番号が選手.csv に無い', () => {
    const { problems } = check({ matchesCsv: editLine(2, (l) => l.replace('5001', '9999')) });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*9999.*選手\.csv/);
  });

  test('出場者のチームがその側のチームと違う／部が違う', () => {
    const { problems } = check({
      // 5007 はもみじ 1部。A 側（あおぞら）に置く／5003 は 2 部。1 部の試合に置く
      matchesCsv: editLine(2, (l) => l.replace('5001,5002', '5007,5003')),
    });
    const text = problems.join('\n');
    expect(text).toMatch(/試合\.csv 2行目.*5007.*チーム/);
    expect(text).toMatch(/試合\.csv 2行目.*5003.*部/);
  });

  test('同じ試合に同じ人が 2 回', () => {
    const { problems } = check({
      matchesCsv: editLine(2, (l) => l.replace('5001,5002', '5001,5001')),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*5001.*2 回/);
  });

  test('ペアの片方だけ空', () => {
    const { problems } = check({ matchesCsv: editLine(2, (l) => l.replace('5001,5002', '5001,')) });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*A1・A2/);
  });

  test('リーグで出場者が空', () => {
    const { problems } = check({ matchesCsv: editLine(2, (l) => l.replace('5001,5002', ',')) });
    expect(problems.join('\n')).toMatch(/試合\.csv 2行目.*リーグ.*出場者/);
  });

  test('リーグで同じ 2 チームの対戦が 2 つ以上（#65 の約束）', () => {
    const { problems } = check({
      matchesCsv: appendLine(
        '予選リーグ,予選 再戦,7,もみじ,あおぞら,1部,1,1,20,5007,5008,5001,5002'
      ),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv 32行目.*もみじ.*あおぞら.*2 つ/);
  });

  test('トーナメントの対戦が 4 つでない', () => {
    const { problems } = check({
      matchesCsv: (t) =>
        t
          .split('\n')
          .filter((l) => !l.startsWith('決勝トーナメント,3位決定戦'))
          .join('\n'),
    });
    expect(problems.join('\n')).toMatch(/決勝トーナメント.*3 つ.*4 つ/);
  });

  test('トーナメントの対戦の順番が重なる', () => {
    const { problems } = check({
      matchesCsv: (t) =>
        t
          .split('\n')
          .map((l) => (l.startsWith('決勝トーナメント,3位決定戦') ? l.replace(',4,', ',3,') : l))
          .join('\n'),
    });
    expect(problems.join('\n')).toMatch(/試合\.csv \d+行目.*対戦の順番.*重なって/);
  });

  test('問題は 1 件目で止めず、全部集める', () => {
    const { problems, plan } = check({
      matchesCsv: (t) =>
        editLine(2, (l) => l.replace('5001', '9999'))(
          editLine(3, (l) => l.replace('5003', '9998'))(t)
        ),
    });
    expect(plan).toBeNull();
    expect(problems.filter((p) => p.includes('選手.csv にありません')).length).toBe(2);
  });
});
