import { describe, expect, test } from 'vitest';
import { applyLiveChange, carryOverReopened, type LiveChange } from '@/ui/courts/apply-live-change';
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
    ending: 'normal',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    scorerParticipantId: null,
    scorerClaimedAt: null,
    scoreSavedAtByGame: {},
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
    savedAt: null,
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
    ending: 'normal',
    scorerParticipantId: null,
    scorerClaimedAt: null,
    ...overrides,
  };
}

const NO_PENDING: Record<string, Pick<MatchSyncState, 'pendingScores'>> = {};

function pendingOf(matchId: string, gameNumber: number, a: number, b: number) {
  return {
    [matchId]: {
      pendingScores: [{ gameNumber, sideAScore: a, sideBScore: b }],
    },
  } satisfies Record<string, Pick<MatchSyncState, 'pendingScores'>>;
}

describe('届いた点を当てる', () => {
  test('届いた行は、その試合のその枠の点になる', () => {
    const result = applyLiveChange([match()], scoreChange(), NO_PENDING);

    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 11, sideBScore: 8 }]);
    expect(result.needsRefresh).toBe(false);
  });

  test('まだ無かった枠の点が届いたら、枠が足される（枠の番号順）', () => {
    const result = applyLiveChange([match()], scoreChange({ gameNumber: 2 }), NO_PENDING);

    expect(result.board[0].scores.map((score) => score.gameNumber)).toEqual([1, 2]);
  });

  test('ほかの試合の点は動かない', () => {
    const board = [match(), match({ matchId: 'm-2', courtNumber: 2 })];
    const result = applyLiveChange(board, scoreChange({ matchId: 'm-2' }), NO_PENDING);

    expect(result.board[0]).toBe(board[0]);
  });

  test('送れていない手元の点は、届いた古い点で上書きされない', () => {
    const board = [match({ scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }] })];
    const result = applyLiveChange(board, scoreChange(), pendingOf('m-1', 1, 12, 8));

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(false);
  });

  test('送れていないのが別の枠なら、届いた枠の点は当たる', () => {
    const board = [match()];
    const result = applyLiveChange(
      board,
      scoreChange({ gameNumber: 1 }),
      pendingOf('m-1', 2, 5, 0)
    );

    expect(result.board[0].scores[0].sideAScore).toBe(11);
  });

  test('手元に無い試合の点が届いたら、読み直しを求める（点は当てない）', () => {
    const board = [match()];
    const result = applyLiveChange(board, scoreChange({ matchId: 'unknown' }), NO_PENDING);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(true);
  });

  test('すでに同じ点なら、一覧は作り直さない（画面を描き直さない）', () => {
    const board = [match()];
    const result = applyLiveChange(
      board,
      scoreChange({ sideAScore: 10, sideBScore: 8 }),
      NO_PENDING
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
      NO_PENDING
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
      NO_PENDING
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
    const result = applyLiveChange(board, matchChange({ status: 'live' }), NO_PENDING);

    expect(result.board[0].status).toBe('live');
    expect(result.board[0].finishedAt).toBeNull();
    expect(result.board[0].reopened).toBe(true);
  });

  test('また終了すると、直している印は外れる', () => {
    const board = [match({ reopened: true })];
    const result = applyLiveChange(
      board,
      matchChange({ status: 'done', finishedAt: '2026-10-09T02:00:00+00:00' }),
      NO_PENDING
    );

    expect(result.board[0].reopened).toBe(false);
  });

  test('コートと順番の変化がカードに反映される', () => {
    const board = [match({ matchId: 'm-1', courtNumber: 1 })];
    const result = applyLiveChange(
      board,
      matchChange({ courtNumber: 4, orderInCourt: 7 }),
      NO_PENDING
    );

    expect(deriveCourts(result.board).map((court) => court.courtNumber)).toEqual([4]);
    expect(result.board[0].orderInCourt).toBe(7);
  });

  test('手元に無い試合の状態の変化が届いたら、読み直しを求める', () => {
    const board = [match()];
    const result = applyLiveChange(board, matchChange({ matchId: 'unknown' }), NO_PENDING);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(true);
  });

  test('何も変わらない状態の届き（自分の書き込みの echo など）は、一覧を作り直さない', () => {
    const board = [match()];
    const result = applyLiveChange(board, matchChange(), NO_PENDING);

    expect(result.board).toBe(board);
    expect(result.needsRefresh).toBe(false);
  });

  test('状態の変化は、送れていない手元の点を消さない', () => {
    const board = [match({ scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }] })];
    const result = applyLiveChange(
      board,
      matchChange({ status: 'done', finishedAt: '2026-10-09T01:00:00+00:00' }),
      pendingOf('m-1', 1, 12, 8)
    );

    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 12, sideBScore: 8 }]);
  });
});

describe('読み直した一覧に、直している試合の印を引き継ぐ', () => {
  test('読み直す前に直していた試合が、まだ進行中なら、直している印を残す', () => {
    const before = [match({ reopened: true })];
    const reloaded = [match({ reopened: false })];

    expect(carryOverReopened(reloaded, before)[0].reopened).toBe(true);
  });

  test('読み直した結果が終了に戻っていれば、印は付けない', () => {
    const before = [match({ reopened: true })];
    const reloaded = [match({ status: 'done', finishedAt: '2026-10-09T01:00:00+00:00' })];

    expect(carryOverReopened(reloaded, before)[0].reopened).toBe(false);
  });

  test('直していなかった試合に印は付かない。印を付ける必要が無ければ同じ一覧を返す', () => {
    const before = [match()];
    const reloaded = [match()];

    expect(carryOverReopened(reloaded, before)).toBe(reloaded);
  });
});

describe('棄権の印（ending）を当てる', () => {
  test('終了と一緒に届いた棄権の印が、その試合に映る', () => {
    const result = applyLiveChange(
      [match()],
      matchChange({
        status: 'done',
        finishedAt: '2026-10-11T01:00:00+00:00',
        ending: 'retired_side_a',
      }),
      NO_PENDING
    );

    expect(result.board[0].ending).toBe('retired_side_a');
  });

  test('終了の取り消しで普通に戻った印が映る（棄権の印だけが変わった知らせも当てる）', () => {
    const retired = match({
      status: 'done',
      finishedAt: '2026-10-11T01:00:00+00:00',
      ending: 'retired_side_b',
    });
    const result = applyLiveChange(
      [retired],
      matchChange({ status: 'live', finishedAt: null, ending: 'normal' }),
      NO_PENDING
    );

    expect(result.board[0].ending).toBe('normal');

    const onlyEndingChanged = applyLiveChange(
      [match({ status: 'done', finishedAt: 'x', ending: 'normal' })],
      matchChange({ status: 'done', finishedAt: 'x', ending: 'retired_side_a' }),
      NO_PENDING
    );
    expect(onlyEndingChanged.board[0].ending).toBe('retired_side_a');
  });
});

describe('届いた担当の変化を当てる（docs/specs/2026-10-14-match-scorer.md）', () => {
  test('担当と、担当になった時刻が試合に当たる', () => {
    const result = applyLiveChange(
      [match()],
      matchChange({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: '2027-01-22T10:00:00+00:00',
      }),
      NO_PENDING
    );

    expect(result.board[0]).toMatchObject({
      scorerParticipantId: 'p-jiro',
      scorerClaimedAt: '2027-01-22T10:00:00+00:00',
    });
    expect(result.needsRefresh).toBe(false);
  });

  test('担当が外れた（空になった）知らせも当たる', () => {
    const board = [
      match({ scorerParticipantId: 'p-jiro', scorerClaimedAt: '2027-01-22T10:00:00+00:00' }),
    ];

    const result = applyLiveChange(board, matchChange(), NO_PENDING);

    expect(result.board[0]).toMatchObject({ scorerParticipantId: null, scorerClaimedAt: null });
  });

  test('担当も時刻も同じなら、一覧は同じ参照のまま（描き直さない）', () => {
    const board = [
      match({ scorerParticipantId: 'p-jiro', scorerClaimedAt: '2027-01-22T10:00:00+00:00' }),
    ];

    const result = applyLiveChange(
      board,
      matchChange({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: '2027-01-22T10:00:00+00:00',
      }),
      NO_PENDING
    );

    expect(result.board).toBe(board);
  });

  test('担当になった時刻だけの変化（自分のまま取り直した）も当たる', () => {
    const board = [
      match({ scorerParticipantId: 'p-jiro', scorerClaimedAt: '2027-01-22T10:00:00+00:00' }),
    ];

    const result = applyLiveChange(
      board,
      matchChange({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: '2027-01-22T10:00:30+00:00',
      }),
      NO_PENDING
    );

    expect(result.board[0].scorerClaimedAt).toBe('2027-01-22T10:00:30+00:00');
  });
});

describe('届いた点の保存時刻を当てる（担当の「最後に点を入れた時刻」の元）', () => {
  const SAVED_AT = '2027-01-22T10:01:00.5+00:00';

  test('点と一緒に、そのゲームの保存時刻が当たる', () => {
    const result = applyLiveChange(
      [match({ scoreSavedAtByGame: { 1: '2027-01-22T10:00:00+00:00' } })],
      scoreChange({ sideAScore: 12, savedAt: SAVED_AT }),
      NO_PENDING
    );

    expect(result.board[0].scoreSavedAtByGame).toEqual({ 1: SAVED_AT });
    expect(result.board[0].scores).toContainEqual({ gameNumber: 1, sideAScore: 12, sideBScore: 8 });
  });

  test('ほかのゲームの保存時刻は残す', () => {
    const result = applyLiveChange(
      [match({ scoreSavedAtByGame: { 1: '2027-01-22T10:00:00+00:00' } })],
      scoreChange({ gameNumber: 2, sideAScore: 1, sideBScore: 0, savedAt: SAVED_AT }),
      NO_PENDING
    );

    expect(result.board[0].scoreSavedAtByGame).toEqual({
      1: '2027-01-22T10:00:00+00:00',
      2: SAVED_AT,
    });
  });

  test('点数が同じでも、保存時刻が新しければ時刻だけ当たる（同じ点を送り直した）', () => {
    const result = applyLiveChange(
      [match()],
      scoreChange({ sideAScore: 10, sideBScore: 8, savedAt: SAVED_AT }),
      NO_PENDING
    );

    expect(result.board[0].scoreSavedAtByGame).toEqual({ 1: SAVED_AT });
    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }]);
  });

  test('手元の点を優先して点数を当てないときも、保存時刻は当たる', () => {
    const result = applyLiveChange([match()], scoreChange({ savedAt: SAVED_AT }), {
      'm-1': { pendingScores: [{ gameNumber: 1, sideAScore: 13, sideBScore: 8 }] },
    });

    expect(result.board[0].scoreSavedAtByGame).toEqual({ 1: SAVED_AT });
    expect(result.board[0].scores).toEqual([{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }]);
  });

  test('点数も保存時刻も同じなら、一覧は同じ参照のまま。時刻の無い古い形の知らせは時刻を変えない', () => {
    const board = [match({ scoreSavedAtByGame: { 1: SAVED_AT } })];

    expect(
      applyLiveChange(board, scoreChange({ sideAScore: 10, savedAt: SAVED_AT }), NO_PENDING).board
    ).toBe(board);
    expect(
      applyLiveChange(board, scoreChange({ sideAScore: 10, savedAt: null }), NO_PENDING).board
    ).toBe(board);
  });
});
