import { describe, expect, test } from 'vitest';
import { initialLiveScores } from '@/ui/courts/initial-live-scores';
import type { Court, CourtTeam, MatchSyncState } from '@/ui/courts/types';

/**
 * 画面を開いたとき、サーバーから読んだ得点と、アプリの中で預かっている「まだ送れていない点」を
 * どう合わせるか（仕様 2026-10-04 の「送れていない点がある間に結果LIVE に戻ると、押した数字のまま」）。
 */

function team(): CourtTeam {
  return { teamNumber: 1, players: ['佐藤'], slotLabel: null };
}

const liveCourt: Court = {
  courtNumber: 1,
  live: {
    matchId: 'match-live',
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: team(),
    teamB: team(),
    isMine: false,
    scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }],
    maxGameCount: 3,
  },
  next: null,
};

const waitingCourt: Court = {
  courtNumber: 2,
  live: null,
  next: {
    matchId: 'match-next',
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 2回戦',
    teamA: team(),
    teamB: team(),
    isMine: false,
    maxGameCount: 1,
  },
};

function syncState(overrides: Partial<MatchSyncState>): MatchSyncState {
  return {
    retryingMessage: null,
    rejectedMessage: null,
    started: false,
    unsentScores: [],
    ...overrides,
  };
}

describe('initialLiveScores', () => {
  test('未送信が無ければ、サーバーから読んだ得点をそのまま出す', () => {
    const result = initialLiveScores([liveCourt], true, {});

    expect(result[1]).toEqual({
      scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }],
      finished: false,
      started: true,
    });
  });

  test('サーバーの数字と未送信の数字が違うときは、未送信の数字を優先する', () => {
    const result = initialLiveScores([liveCourt], true, {
      'match-live': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }],
      }),
    });

    expect(result[1].scores).toEqual([{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }]);
  });

  test('未送信が無いゲームはサーバーの数字のまま。未送信のゲームだけ置き換わり、ゲーム番号順に並ぶ', () => {
    const result = initialLiveScores([liveCourt], true, {
      'match-live': syncState({
        unsentScores: [{ gameNumber: 2, sideAScore: 1, sideBScore: 0 }],
      }),
    });

    expect(result[1].scores).toEqual([
      { gameNumber: 1, sideAScore: 8, sideBScore: 6 },
      { gameNumber: 2, sideAScore: 1, sideBScore: 0 },
    ]);
  });

  test('呼出待ちのコートで 1 点入れたまま送れていなければ、LIVE の見た目と未送信の数字で戻る', () => {
    const result = initialLiveScores([waitingCourt], true, {
      'match-next': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
      }),
    });

    expect(result[2]).toEqual({
      scores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
      finished: false,
      started: true,
    });
  });

  // 仕様「呼出待ちから始まった試合は、0 対 0 に戻しても LIVE の見た目のまま」
  test('呼出待ちのコートで 1 点入れてから 0 対 0 に戻し、送れていないまま戻っても LIVE の見た目のまま', () => {
    const result = initialLiveScores([waitingCourt], true, {
      'match-next': syncState({
        started: true,
        unsentScores: [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }],
      }),
    });

    expect(result[2]).toEqual({
      scores: [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }],
      finished: false,
      started: true,
    });
  });

  test('呼出待ちのコートで一度点を入れた試合は、ぜんぶ送れたあとに戻っても LIVE の見た目のまま', () => {
    const result = initialLiveScores([waitingCourt], true, {
      'match-next': syncState({ started: true }),
    });

    expect(result[2]).toEqual({ scores: [], finished: false, started: true });
  });

  test('呼出待ちのコートで 0 対 0 しか押していなければ、呼出待ちの見た目のまま（数字は戻す）', () => {
    const result = initialLiveScores([waitingCourt], true, {
      'match-next': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }],
      }),
    });

    expect(result[2]?.started).toBe(false);
  });

  test('呼出待ちのコートに未送信が無ければ、得点の状態は作らない（呼出待ちのまま）', () => {
    const result = initialLiveScores([waitingCourt], true, {});

    expect(result[2]).toBeUndefined();
  });

  test('観戦者には、未送信があっても呼出待ちのコートの状態を作らない', () => {
    const result = initialLiveScores([waitingCourt], false, {
      'match-next': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
      }),
    });

    expect(result[2]).toBeUndefined();
  });

  test('観戦者には、進行中のコートでも未送信の数字を混ぜない（観戦者は点を入れない）', () => {
    const result = initialLiveScores([liveCourt], false, {
      'match-live': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }],
      }),
    });

    expect(result[1].scores).toEqual([{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }]);
  });

  test('別のコートの未送信は混ざらない', () => {
    const result = initialLiveScores([liveCourt, waitingCourt], true, {
      'match-next': syncState({
        unsentScores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
      }),
    });

    expect(result[1].scores).toEqual([{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }]);
  });
});
