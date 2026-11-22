import { describe, expect, test } from 'vitest';
import {
  changedGamesOf,
  checkDraft,
  describeChanges,
  draftOf,
  setScore,
  toRequestBody,
} from '@/ui/matches/correction-draft';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 2b 直す画面の「手元の値」の決まり。送る前の値だけを変え、元の値と比べて「元は ◯」「変えるところ」を作る。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const done = boardMatch({
  status: 'done',
  maxGameCount: 3,
  ending: 'retired_side_b',
  teamA: { teamNumber: 1, players: ['ハルキ', 'ミドリ'], slotLabel: null },
  teamB: { teamNumber: 3, players: ['シン', 'ヒナ'], slotLabel: null },
  scores: [
    { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
    { gameNumber: 2, sideAScore: 8, sideBScore: 3 },
  ],
});

describe('draftOf', () => {
  test('元の点と棄権をそのまま手元の値にする。上限ゲーム数ぶんの枠があり、無い枠は 0 対 0', () => {
    const draft = draftOf(done);

    expect(draft.scores).toEqual([
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 8, sideBScore: 3 },
      { gameNumber: 3, sideAScore: 0, sideBScore: 0 },
    ]);
    expect(draft.retiredSide).toBe('B');
  });
});

describe('点を変える', () => {
  test('setScore は指定のゲームの片側だけ変え、元の値は動かさない。0 未満にはならない', () => {
    const draft = draftOf(done);
    const changed = setScore(draft, 2, 'A', 21);
    const floored = setScore(draft, 2, 'B', -4);

    expect(changed.scores[1]).toEqual({ gameNumber: 2, sideAScore: 21, sideBScore: 3 });
    expect(draft.scores[1].sideAScore).toBe(8);
    expect(floored.scores[1].sideBScore).toBe(0);
  });
});

describe('変えたところ', () => {
  test('変えたゲームだけが「元は ◯」の対象になる', () => {
    const draft = setScore(setScore(draftOf(done), 2, 'A', 21), 2, 'B', 17);

    expect(changedGamesOf(done, draft)).toEqual([
      { gameNumber: 2, before: [8, 3], after: [21, 17] },
    ]);
  });

  test('何も変えていなければ空。同じ値に戻せば変更なしに戻る', () => {
    const back = setScore(setScore(draftOf(done), 2, 'A', 9), 2, 'A', 8);

    expect(changedGamesOf(done, back)).toEqual([]);
  });

  test('まとめは「第◯ゲーム ◯-◯ → ◯-◯」と、棄権の付け外し', () => {
    const draft = {
      ...setScore(setScore(draftOf(done), 2, 'A', 21), 2, 'B', 17),
      retiredSide: null,
    };

    expect(describeChanges(done, draft)).toEqual(['第2ゲーム 8-3 → 21-17', '棄権を外す']);
    const added = { ...draftOf({ ...done, ending: 'normal' }), retiredSide: 'A' as const };
    expect(describeChanges({ ...done, ending: 'normal' }, added)).toEqual([
      '棄権を付ける（ハルキ・ミドリ）',
    ]);
    const switched = { ...draftOf(done), retiredSide: 'A' as const };
    expect(describeChanges(done, switched)).toEqual(['棄権を ハルキ・ミドリ に変える']);
  });

  test('新しいゲームを足したときは 0-0 からの変更として出る', () => {
    const draft = setScore(setScore(draftOf(done), 3, 'A', 5), 3, 'B', 2);

    expect(describeChanges(done, draft)[0]).toBe('第3ゲーム 0-0 → 5-2');
  });
});

describe('保存してよいか', () => {
  test('1 点も無ければ、日本語の理由が返る', () => {
    const empty = {
      ...draftOf(done),
      scores: draftOf(done).scores.map((s) => ({ ...s, sideAScore: 0, sideBScore: 0 })),
    };

    expect(checkDraft(done, empty)).toEqual({
      ok: false,
      reason: expect.stringContaining('1 点も'),
    });
  });

  test('同点（勝ちゲーム数が同じ）なら、終了と同じ理由が返る', () => {
    const tie = setScore(setScore(draftOf(done), 2, 'A', 3), 2, 'B', 21);

    expect(checkDraft(done, tie)).toEqual({ ok: false, reason: '同点では訂正できません。どちらかが勝つ点にしてください。' });
  });

  test('変えていないと保存できない', () => {
    expect(checkDraft(done, draftOf(done))).toEqual({
      ok: false,
      reason: '変えたところがありません。',
    });
  });

  test('変えて、勝敗が決まっていれば保存できる', () => {
    const draft = setScore(draftOf(done), 2, 'A', 21);

    expect(checkDraft(done, draft)).toEqual({ ok: true });
  });
});

describe('toRequestBody', () => {
  test('全ゲームの点と棄権の側を、入口の本文の形にする', () => {
    const body = toRequestBody(setScore(draftOf(done), 2, 'A', 21));

    expect(body).toEqual({
      scores: [
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 21, sideBScore: 3 },
        { gameNumber: 3, sideAScore: 0, sideBScore: 0 },
      ],
      retiredSide: 'B',
    });
  });
});
