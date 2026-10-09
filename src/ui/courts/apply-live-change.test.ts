import { describe, expect, test } from 'vitest';
import { applyLiveChange, type LiveChange } from '@/ui/courts/apply-live-change';
import { deriveCourts } from '@/ui/courts/derive-courts';
import type { CourtMatch, MatchSyncState } from '@/ui/courts/types';

/**
 * 他の人の点や試合の状態の変化（Supabase から届いた 1 行）を、画面が持つ試合の一覧に当てる判断。
 * 通信も画面も触らない純粋な関数なので、ここで速く確かめる。
 *
 * 仕様: docs/specs/2026-10-09-courts-live-and-finish.md
 */

function match(overrides: Partial<CourtMatch> = {}): CourtMatch {
  return {
    matchId: 'm-1',
    status: 'live',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    reopened: false,
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: { teamNumber: 1, players: ['佐藤', '鈴木'], slotLabel: null },
    teamB: { teamNumber: 2, players: ['高橋', '伊藤'], slotLabel: null },
    isMine: false,
    maxGameCount: 3,
    scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
    ...overrides,
  };
}

function scoreChange(overrides: Partial<Extract<LiveChange, { kind: 'score' }>> = {}): LiveChange {
  return {
    kind: 'score',
    matchId: 'm-1',
    gameNumber: 1,
    sideAScore: 11,
    sideBScore: 8,
    ...overrides,
  };
}

function matchChange(overrides: Partial<Extract<LiveChange, { kind: 'match' }>> = {}): LiveChange {
  return {
    kind: 'match',
    matchId: 'm-1',
    status: 'live',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    maxGameCount: 3,
    ...overrides,
  };
}

const NO_UNSENT: Record<string, Pick<MatchSyncState, 'unsentScores'>> = {};

function unsentOf(matchId: string, gameNumber: number, a: number, b: number) {
  return {
    [matchId]: {
      unsentScores: [{ gameNumber, sideAScore: a, sideBScore: b }],
    },
  } satisfies Record<string, Pick<MatchSyncState, 'unsentScores'>>;
}

describe('届いた点を当てる', () => {
  test('届いた行は、その試合のその枠の点になる', () => {
    const result = applyLiveChange([match()], scoreChange(), NO_UNSENT);

    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 11, sideBScore: 8 }]);
    expect(result.needsRefresh).toBe(false);
  });

  test('まだ無かった枠の点が届いたら、枠が足される（枠の番号順）', () => {
    const result = applyLiveChange([match()], scoreChange({ gameNumber: 2 }), NO_UNSENT);

    expect(result.board[0].scores.map((score) => score.gameNumber)).toEqual([1, 2]);
  });

  test('ほかの試合の点は動かない', () => {
    const board = [match(), match({ matchId: 'm-2', courtNumber: 2 })];
    const result = applyLiveChange(board, scoreChange({ matchId: 'm-2' }), NO_UNSENT);

    expect(result.board[0]).toBe(board[0]);
  });

  test('送れていない手元の点は、届いた古い点で上書きされない', () => {
    const board = [match({ scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }] })];
    const result = applyLiveChange(board, scoreChange(), unsentOf('m-1', 1, 12, 8));

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(false);
  });

  test('送れていないのが別の枠なら、届いた枠の点は当たる', () => {
    const board = [match()];
    const result = applyLiveChange(board, scoreChange({ gameNumber: 1 }), unsentOf('m-1', 2, 5, 0));

    expect(result.board[0].scores[0].sideAScore).toBe(11);
  });

  test('手元に無い試合の点が届いたら、読み直しを求める（点は当てない）', () => {
    const board = [match()];
    const result = applyLiveChange(board, scoreChange({ matchId: 'unknown' }), NO_UNSENT);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(true);
  });

  test('すでに同じ点なら、一覧は作り直さない（画面を描き直さない）', () => {
    const board = [match()];
    const result = applyLiveChange(
      board,
      scoreChange({ sideAScore: 10, sideBScore: 8 }),
      NO_UNSENT
    );

    expect(result.board).toBe(board);
  });
});

describe('届いた試合の状態の変化を当てる', () => {
  test('次の試合が始まる（waiting → live）と、そのコートの進行中が切り替わる', () => {
    const board = [
      match({ matchId: 'next', status: 'waiting', orderInCourt: 2, scores: [] }),
      match({ matchId: 'later', status: 'waiting', orderInCourt: 3, scores: [] }),
    ];
    const result = applyLiveChange(
      board,
      matchChange({ matchId: 'next', status: 'live', orderInCourt: 2 }),
      NO_UNSENT
    );

    const [court] = deriveCourts(result.board);
    expect(court.live?.matchId).toBe('next');
    // その次の試合が「次」に繰り上がる（読み直さなくても分かる）
    expect(court.next?.matchId).toBe('later');
    expect(result.needsRefresh).toBe(false);
  });

  test('試合が終わる（live → done）と、そのコートの進行中が外れ、終了の時刻が入る', () => {
    const board = [match(), match({ matchId: 'next', status: 'waiting', orderInCourt: 2 })];
    const result = applyLiveChange(
      board,
      matchChange({ status: 'done', finishedAt: '2026-10-09T01:00:00+00:00' }),
      NO_UNSENT
    );

    const [court] = deriveCourts(result.board);
    expect(court.live).toBeNull();
    expect(court.next?.matchId).toBe('next');
    expect(result.board[0].finishedAt).toBe('2026-10-09T01:00:00+00:00');
    expect(result.board[0].status).toBe('done');
  });

  test('終了が取り消される（done → live）と、直している試合の印が付き、終了の時刻は消える', () => {
    const board = [
      match({ status: 'done', finishedAt: '2026-10-09T01:00:00+00:00', reopened: false }),
    ];
    const result = applyLiveChange(board, matchChange({ status: 'live' }), NO_UNSENT);

    expect(result.board[0].status).toBe('live');
    expect(result.board[0].finishedAt).toBeNull();
    expect(result.board[0].reopened).toBe(true);
  });

  test('また終了すると、直している印は外れる', () => {
    const board = [match({ reopened: true })];
    const result = applyLiveChange(
      board,
      matchChange({ status: 'done', finishedAt: '2026-10-09T02:00:00+00:00' }),
      NO_UNSENT
    );

    expect(result.board[0].reopened).toBe(false);
  });

  test('コートと順番の変化がカードに反映される', () => {
    const board = [match({ matchId: 'm-1', courtNumber: 1 })];
    const result = applyLiveChange(
      board,
      matchChange({ courtNumber: 4, orderInCourt: 7 }),
      NO_UNSENT
    );

    expect(deriveCourts(result.board).map((court) => court.courtNumber)).toEqual([4]);
    expect(result.board[0].orderInCourt).toBe(7);
  });

  test('手元に無い試合の状態の変化が届いたら、読み直しを求める', () => {
    const board = [match()];
    const result = applyLiveChange(board, matchChange({ matchId: 'unknown' }), NO_UNSENT);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(true);
  });

  test('何も変わらない状態の届き（自分の書き込みの echo など）は、一覧を作り直さない', () => {
    const board = [match()];
    const result = applyLiveChange(board, matchChange(), NO_UNSENT);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(false);
  });

  test('状態の変化は、送れていない手元の点を消さない', () => {
    const board = [match({ scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }] })];
    const result = applyLiveChange(
      board,
      matchChange({ status: 'done', finishedAt: '2026-10-09T01:00:00+00:00' }),
      unsentOf('m-1', 1, 12, 8)
    );

    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }]);
  });
});
