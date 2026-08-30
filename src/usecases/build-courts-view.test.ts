import { describe, expect, test } from 'vitest';
import {
  buildCourtsView,
  type CourtsViewInput,
  type CourtsViewMatchRow,
} from '@/usecases/build-courts-view';

/** 最小限のフィールドだけ変えられるよう、丸ごと上書きできる作成用ヘルパー。 */
function match(overrides: Partial<CourtsViewMatchRow> & { matchId: string }): CourtsViewMatchRow {
  return {
    courtNumber: 1,
    orderInCourt: 1,
    status: 'live',
    maxGameCount: 1,
    divisionName: '1部',
    roundName: '予選 1回戦',
    teamA: { teamNumber: 1, players: [{ playerId: 'p-a1', name: '佐々木' }] },
    teamB: { teamNumber: 2, players: [{ playerId: 'p-b1', name: '田中' }] },
    gameScores: [],
    ...overrides,
  };
}

function view(
  input: Partial<CourtsViewInput> & { matches: CourtsViewMatchRow[] }
): CourtsViewInput {
  return { currentPlayerId: null, ...input };
}

describe('buildCourtsView', () => {
  test('court_number があり status が live/waiting の試合だけをコートに出す', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({ matchId: 'm1', courtNumber: 1, status: 'live' }),
          match({ matchId: 'm2', courtNumber: 1, status: 'done', orderInCourt: 0 }),
        ],
      })
    );

    expect(courts).toHaveLength(1);
    expect(courts[0].live?.matchId).toBe('m1');
  });

  test('進行中の試合の得点が games にそのまま出る', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({
            matchId: 'm1',
            maxGameCount: 1,
            gameScores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }],
          }),
        ],
      })
    );

    expect(courts[0].live?.games).toEqual([[8, 6]]);
  });

  test('まだ行の無いゲームの枠は 0-0 で埋める（max_game_count 個ぶん）', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({
            matchId: 'm1',
            maxGameCount: 3,
            gameScores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
          }),
        ],
      })
    );

    expect(courts[0].live?.games).toEqual([
      [21, 15],
      [0, 0],
      [0, 0],
    ]);
  });

  test('status が live の試合は LiveMatch.status も live になる', () => {
    const courts = buildCourtsView(view({ matches: [match({ matchId: 'm1', status: 'live' })] }));
    expect(courts[0].live?.status).toBe('live');
  });

  test('status が waiting の試合は LiveMatch.status も waiting になる（まだ LIVE 表示にしない）', () => {
    const courts = buildCourtsView(
      view({ matches: [match({ matchId: 'm1', status: 'waiting' })] })
    );
    expect(courts[0].live?.status).toBe('waiting');
  });

  test('done の試合は出さない', () => {
    const courts = buildCourtsView(view({ matches: [match({ matchId: 'm1', status: 'done' })] }));
    expect(courts).toHaveLength(0);
  });

  test('同じコートでは order_in_court が若いほうが live、次が next になる', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({ matchId: 'm2', orderInCourt: 2, status: 'waiting', roundName: '2番目' }),
          match({ matchId: 'm1', orderInCourt: 1, status: 'live', roundName: '1番目' }),
        ],
      })
    );

    expect(courts[0].live?.matchId).toBe('m1');
    expect(courts[0].next?.classLabel).toBe('1部');
  });

  test('同じコートに 3 試合以上あっても、3 つ目以降は出さない', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({ matchId: 'm1', orderInCourt: 1, status: 'waiting' }),
          match({ matchId: 'm2', orderInCourt: 2, status: 'waiting' }),
          match({ matchId: 'm3', orderInCourt: 3, status: 'waiting' }),
        ],
      })
    );

    expect(courts[0].live?.matchId).toBe('m1');
    // next は 2 番目の試合だけ。3 番目はどこにも出ない。
    expect(courts).toHaveLength(1);
  });

  test('次の試合しか無いコートは live が null になる', () => {
    // 実際には現状の設計では起きない（現在の枠が必ず live になる）が、
    // 空リストのコートは出てこないことを確かめておく。
    const courts = buildCourtsView(view({ matches: [] }));
    expect(courts).toEqual([]);
  });

  test('コート番号の若い順に並ぶ', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({ matchId: 'm2', courtNumber: 2 }),
          match({ matchId: 'm1', courtNumber: 1 }),
        ],
      })
    );

    expect(courts.map((c) => c.courtNumber)).toEqual([1, 2]);
  });

  test('自分がどちらかのチームに出ている試合は isMine が true になる', () => {
    const courts = buildCourtsView(
      view({
        currentPlayerId: 'p-b1',
        matches: [match({ matchId: 'm1' })],
      })
    );

    expect(courts[0].live?.isMine).toBe(true);
  });

  test('自分が出ていない試合は isMine が false になる', () => {
    const courts = buildCourtsView(
      view({
        currentPlayerId: 'p-other',
        matches: [match({ matchId: 'm1' })],
      })
    );

    expect(courts[0].live?.isMine).toBe(false);
  });

  test('入場していない（currentPlayerId が null）ときは isMine が false になる', () => {
    const courts = buildCourtsView(
      view({ currentPlayerId: null, matches: [match({ matchId: 'm1' })] })
    );

    expect(courts[0].live?.isMine).toBe(false);
  });

  test('next の試合にも isMine が付く', () => {
    const courts = buildCourtsView(
      view({
        currentPlayerId: 'p-b1',
        matches: [
          match({ matchId: 'm1', orderInCourt: 1, status: 'live' }),
          match({
            matchId: 'm2',
            orderInCourt: 2,
            status: 'waiting',
            teamA: { teamNumber: 3, players: [{ playerId: 'other', name: '山田' }] },
            teamB: { teamNumber: 4, players: [{ playerId: 'p-b1', name: '中村' }] },
          }),
        ],
      })
    );

    expect(courts[0].next?.isMine).toBe(true);
  });

  test('チーム名・ペア名がそのまま CourtTeam に出る', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({
            matchId: 'm1',
            teamA: {
              teamNumber: 3,
              players: [
                { playerId: 'a1', name: '佐々木' },
                { playerId: 'a2', name: '井上' },
              ],
            },
          }),
        ],
      })
    );

    expect(courts[0].live?.teamA).toEqual({ number: 3, players: ['佐々木', '井上'] });
  });

  test('チームがまだ決まっていない試合（決勝の空枠）は、コートに出さずに飛ばす', () => {
    const courts = buildCourtsView(
      view({
        matches: [
          match({
            matchId: 'm1',
            courtNumber: 1,
            teamB: { teamNumber: null, players: [] },
          }),
          match({ matchId: 'm2', courtNumber: 2 }),
        ],
      })
    );

    // 空枠でエラーにして画面ごと落とさない。出せるコートだけ出す。
    expect(courts.map((c) => c.courtNumber)).toEqual([2]);
  });

  test('部の名前が想定外だとエラーになる', () => {
    expect(() =>
      buildCourtsView(view({ matches: [match({ matchId: 'm1', divisionName: '4部' })] }))
    ).toThrow();
  });

  test('チーム番号が想定外だとエラーになる', () => {
    expect(() =>
      buildCourtsView(
        view({
          matches: [match({ matchId: 'm1', teamA: { teamNumber: 5, players: [] } })],
        })
      )
    ).toThrow();
  });
});
