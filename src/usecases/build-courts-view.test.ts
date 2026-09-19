import { describe, expect, test } from 'vitest';
import {
  buildCourtsView,
  COURT_NUMBERS,
  type CourtsViewInput,
  type CourtsViewMatchRow,
} from '@/usecases/build-courts-view';

/**
 * `buildCourtsView` を偽物の入力で確かめる（純粋な計算なので DB を触らない）。
 * 実際に DB から読めるかは `src/db/courts.test.ts` が確かめる。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 */

const DIVISIONS = [
  { id: 'div-1', sortOrder: 10 },
  { id: 'div-2', sortOrder: 20 },
];

const STAGES = [
  { id: 'stage-league', name: '予選リーグ', sortOrder: 10 },
  { id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20 },
];

function side(overrides: Partial<CourtsViewMatchRow['sideA']> = {}): CourtsViewMatchRow['sideA'] {
  return { teamNumber: 1, slotLabel: null, players: [], ...overrides };
}

function match(overrides: Partial<CourtsViewMatchRow> = {}): CourtsViewMatchRow {
  return {
    matchId: 'match-1',
    status: 'live',
    maxGameCount: 1,
    courtNumber: 1,
    orderInCourt: 1,
    divisionId: 'div-1',
    stageId: 'stage-league',
    roundName: '予選 1回戦',
    sideA: side({
      teamNumber: 1,
      players: [
        { participantId: 'p-a1', orderInPair: 1, name: '佐藤' },
        { participantId: 'p-a2', orderInPair: 2, name: '鈴木' },
      ],
    }),
    sideB: side({
      teamNumber: 2,
      players: [
        { participantId: 'p-b1', orderInPair: 1, name: '高橋' },
        { participantId: 'p-b2', orderInPair: 2, name: '伊藤' },
      ],
    }),
    gameScores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
    ...overrides,
  };
}

function baseInput(overrides: Partial<CourtsViewInput> = {}): CourtsViewInput {
  return {
    myParticipantId: null,
    divisions: DIVISIONS,
    stages: STAGES,
    matches: [match()],
    ...overrides,
  };
}

describe('buildCourtsView', () => {
  test('コートは試合の有無にかかわらず常に1〜8の8枚返る', () => {
    const view = buildCourtsView(baseInput());

    expect(view.courts.map((c) => c.courtNumber)).toEqual([...COURT_NUMBERS]);
    expect(view.courts).toHaveLength(8);
  });

  test('試合の無いコートは live も next も null', () => {
    const view = buildCourtsView(baseInput({ matches: [] }));

    for (const court of view.courts) {
      expect(court.live).toBeNull();
      expect(court.next).toBeNull();
    }
  });

  test('進行中の試合が部・回戦・両ペアの名前・得点つきで出る', () => {
    const view = buildCourtsView(baseInput());
    const court1 = view.courts.find((c) => c.courtNumber === 1)!;

    expect(court1.live).not.toBeNull();
    expect(court1.live!.classLabel).toBe('1部');
    expect(court1.live!.roundLabel).toBe('予選 1回戦');
    expect(court1.live!.teamA.players).toEqual(['佐藤', '鈴木']);
    expect(court1.live!.teamB.players).toEqual(['高橋', '伊藤']);
    expect(court1.live!.scores).toEqual([{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }]);
    expect(court1.live!.maxGameCount).toBe(1);
    expect(court1.live!.matchId).toBe('match-1');
  });

  test('次の試合には、あとで保存に使う matchId・回戦・枠の数も出る', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-next', status: 'waiting', maxGameCount: 3, roundName: '準決勝' }),
        ],
      })
    );

    expect(view.courts[0].next!.matchId).toBe('m-next');
    expect(view.courts[0].next!.roundLabel).toBe('準決勝');
    expect(view.courts[0].next!.maxGameCount).toBe(3);
  });

  test('チーム番号は1〜4に折り返される', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ sideA: side({ teamNumber: 5, players: [] }) })],
      })
    );

    expect(view.courts[0].live!.teamA.teamNumber).toBe(1);
  });

  test('進行中の試合が2つあれば order_in_court の若いほうを進行中として出す', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-2', orderInCourt: 2, roundName: '2番目' }),
          match({ matchId: 'm-1', orderInCourt: 1, roundName: '1番目' }),
        ],
      })
    );

    expect(view.courts[0].live!.roundLabel).toBe('1番目');
  });

  test('waitingの試合はnextに、order_in_courtが最小のものが出る', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ status: 'live' }),
          match({ matchId: 'm-wait-2', status: 'waiting', orderInCourt: 3 }),
          match({ matchId: 'm-wait-1', status: 'waiting', orderInCourt: 2 }),
        ],
      })
    );

    // waiting の中で order_in_court が最小の m-wait-1 が next になる
    expect(view.courts[0].next).not.toBeNull();
  });

  test('進行中が無く次があれば next だけ入る', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ status: 'waiting' })],
      })
    );

    expect(view.courts[0].live).toBeNull();
    expect(view.courts[0].next).not.toBeNull();
  });

  test('doneの試合はliveにもnextにもならない', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ status: 'done' })],
      })
    );

    expect(view.courts[0].live).toBeNull();
    expect(view.courts[0].next).toBeNull();
  });

  test('出場者が決まっていない側は選手名が空で空枠ラベルが入る', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({
            sideB: side({ teamNumber: null, players: [], slotLabel: '予選4位' }),
          }),
        ],
      })
    );

    expect(view.courts[0].live!.teamB.players).toEqual([]);
    expect(view.courts[0].live!.teamB.slotLabel).toBe('予選4位');
    expect(view.courts[0].live!.teamB.teamNumber).toBeNull();
  });

  test('自分が出ている試合には isMine が true になる', () => {
    const view = buildCourtsView(baseInput({ myParticipantId: 'p-a1' }));

    expect(view.courts[0].live!.isMine).toBe(true);
  });

  test('自分が出ていない試合には isMine が false になる', () => {
    const view = buildCourtsView(baseInput({ myParticipantId: 'someone-else' }));

    expect(view.courts[0].live!.isMine).toBe(false);
  });

  test('観戦者（myParticipantId が null）は isMine が常に false', () => {
    const view = buildCourtsView(baseInput({ myParticipantId: null }));

    expect(view.courts[0].live!.isMine).toBe(false);
  });

  describe('いまの段', () => {
    test('決勝の試合がまだ全部waitingなら予選リーグが現在の段になる', () => {
      const view = buildCourtsView(
        baseInput({
          matches: [
            match({ status: 'done', stageId: 'stage-league' }),
            match({ matchId: 'm-2', status: 'waiting', stageId: 'stage-knockout' }),
          ],
        })
      );

      expect(view.stageLabel).toBe('予選リーグ');
    });

    test('消化数は現在の段の試合だけを数える', () => {
      const view = buildCourtsView(
        baseInput({
          matches: [
            match({ matchId: 'm-1', status: 'done', stageId: 'stage-league' }),
            match({ matchId: 'm-2', status: 'live', stageId: 'stage-league' }),
            match({ matchId: 'm-3', status: 'waiting', stageId: 'stage-league' }),
            match({ matchId: 'm-4', status: 'waiting', stageId: 'stage-knockout' }),
          ],
        })
      );

      expect(view.stageLabel).toBe('予選リーグ');
      expect(view.completedMatches).toBe(1);
      expect(view.totalMatches).toBe(3);
    });

    test('決勝の試合が1つでもwaiting以外になれば、ラベルと消化数が決勝トーナメントに切り替わる', () => {
      const view = buildCourtsView(
        baseInput({
          matches: [
            match({ matchId: 'm-1', status: 'done', stageId: 'stage-league' }),
            match({ matchId: 'm-2', status: 'waiting', stageId: 'stage-league' }),
            match({ matchId: 'm-3', status: 'live', stageId: 'stage-knockout' }),
            match({ matchId: 'm-4', status: 'waiting', stageId: 'stage-knockout' }),
          ],
        })
      );

      expect(view.stageLabel).toBe('決勝トーナメント');
      expect(view.completedMatches).toBe(0);
      expect(view.totalMatches).toBe(2);
    });

    test('どの段の試合もまだ無ければ、並び順が最初の段になる', () => {
      const view = buildCourtsView(baseInput({ matches: [] }));

      expect(view.stageLabel).toBe('予選リーグ');
      expect(view.completedMatches).toBe(0);
      expect(view.totalMatches).toBe(0);
    });
  });
});
