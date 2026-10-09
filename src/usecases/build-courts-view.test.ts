import { describe, expect, test } from 'vitest';
import {
  buildCourtsView,
  type CourtsViewInput,
  type CourtsViewMatchRow,
  type CourtsViewStageRow,
} from '@/usecases/build-courts-view';

/**
 * `buildCourtsView` を偽物の入力で確かめる（純粋な計算なので DB を触らない）。
 * 実際に DB から読めるかは `src/db/courts.test.ts` が確かめる。
 *
 * 入力の `matches` は **live と waiting の試合だけ**（終わった試合は読まない）。
 * 「◯/◯ 試合消化」は段ごとの件数（`totalMatches` / `doneMatches`）から出す。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 */

const DIVISIONS = [
  { id: 'div-1', name: '1部', sortOrder: 10 },
  { id: 'div-2', name: '2部', sortOrder: 20 },
];

function stage(overrides: Partial<CourtsViewStageRow> & Pick<CourtsViewStageRow, 'id'>) {
  return {
    name: overrides.id,
    sortOrder: 10,
    totalMatches: 0,
    doneMatches: 0,
    ...overrides,
  } satisfies CourtsViewStageRow;
}

const STAGES: CourtsViewStageRow[] = [
  stage({ id: 'stage-league', name: '予選リーグ', sortOrder: 10, totalMatches: 6 }),
  stage({ id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20, totalMatches: 4 }),
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
    truncated: false,
    ...overrides,
  };
}

describe('コートのカード（試合に入っているコート番号から出す）', () => {
  test('進行中・未実施の試合が割り当てられたコートの数だけ出る（8 枚に固定しない）', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-1', courtNumber: 1 }),
          match({ matchId: 'm-2', courtNumber: 2 }),
          match({ matchId: 'm-3', courtNumber: 3, status: 'waiting' }),
        ],
      })
    );

    expect(view.courts.map((c) => c.courtNumber)).toEqual([1, 2, 3]);
  });

  test('9・10 番のコートの試合も出る', () => {
    const courtNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const view = buildCourtsView(
      baseInput({
        matches: courtNumbers.map((courtNumber) =>
          match({ matchId: `m-${courtNumber}`, courtNumber })
        ),
      })
    );

    expect(view.courts.map((c) => c.courtNumber)).toEqual(courtNumbers);
  });

  test('番号が飛んでいても飛んだまま、昇順で出す（空きの番号を埋めない）', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-5', courtNumber: 5 }),
          match({ matchId: 'm-1', courtNumber: 1 }),
          match({ matchId: 'm-4', courtNumber: 4, status: 'waiting' }),
          match({ matchId: 'm-2', courtNumber: 2 }),
        ],
      })
    );

    expect(view.courts.map((c) => c.courtNumber)).toEqual([1, 2, 4, 5]);
  });

  test('同じコートに複数の試合があってもカードは 1 枚', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-1', courtNumber: 3, orderInCourt: 1 }),
          match({ matchId: 'm-2', courtNumber: 3, orderInCourt: 2, status: 'waiting' }),
        ],
      })
    );

    expect(view.courts).toHaveLength(1);
  });

  test('コートが決まっていない試合（court_number が null）はカードにしない', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-1', courtNumber: 2 }),
          match({ matchId: 'm-2', courtNumber: null, status: 'waiting' }),
        ],
      })
    );

    expect(view.courts.map((c) => c.courtNumber)).toEqual([2]);
  });

  test('出す試合の無いコート番号のカードは作らない（「予定なし」のカードは出ない）', () => {
    const view = buildCourtsView(baseInput({ matches: [match({ courtNumber: 4 })] }));

    expect(view.courts.map((c) => c.courtNumber)).toEqual([4]);
  });
});

describe('カードが 0 枚のときの理由', () => {
  test('カードがあれば理由は無い', () => {
    expect(buildCourtsView(baseInput()).emptyReason).toBeNull();
  });

  test('試合が残っているのにコートが 1 つも決まっていなければ「コート未定」', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [
          match({ matchId: 'm-1', status: 'waiting', courtNumber: null }),
          match({ matchId: 'm-2', status: 'waiting', courtNumber: null }),
        ],
      })
    );

    expect(view.courts).toEqual([]);
    expect(view.emptyReason).toBe('courts-undecided');
  });

  test('残っている試合が無く、試合自体はあったなら「全部終わった」', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [],
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6, doneMatches: 6 }),
          stage({
            id: 'stage-knockout',
            name: '決勝トーナメント',
            sortOrder: 20,
            totalMatches: 4,
            doneMatches: 4,
          }),
        ],
      })
    );

    expect(view.courts).toEqual([]);
    expect(view.emptyReason).toBe('all-finished');
  });

  test('試合が 1 つも無い大会は「試合が無い」（「全部終わった」と言わない）', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [],
        stages: [stage({ id: 'stage-league', name: '予選リーグ' })],
      })
    );

    expect(view.emptyReason).toBe('no-matches');
  });

  test('段が 1 つも無い大会も「試合が無い」', () => {
    const view = buildCourtsView(baseInput({ matches: [], stages: [] }));

    expect(view.emptyReason).toBe('no-matches');
  });
});

describe('buildCourtsView', () => {
  test('進行中の試合が部・回戦・両ペアの名前・得点つきで出る', () => {
    const view = buildCourtsView(baseInput());
    const court1 = view.courts.find((c) => c.courtNumber === 1)!;

    expect(court1.live).not.toBeNull();
    expect(court1.live!.classLabel).toEqual({ name: '1部', colorNumber: 1 });
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

  test('部の文字は divisions.name、色は並び順の番号', () => {
    const view = buildCourtsView(
      baseInput({
        divisions: [
          { id: 'div-1', name: '初級', sortOrder: 20 },
          { id: 'div-2', name: '上級', sortOrder: 10 },
        ],
        matches: [match({ divisionId: 'div-1' })],
      })
    );

    expect(view.courts[0].live!.classLabel).toEqual({ name: '初級', colorNumber: 2 });
  });

  test('4 部以降も色が付く（3 で止めない）', () => {
    const view = buildCourtsView(
      baseInput({
        divisions: [10, 20, 30, 40, 50, 60].map((sortOrder, index) => ({
          id: `div-${index + 1}`,
          name: `部${index + 1}`,
          sortOrder,
        })),
        matches: [match({ divisionId: 'div-5' })],
      })
    );

    expect(view.courts[0].live!.classLabel).toEqual({ name: '部5', colorNumber: 5 });
  });

  test('その大会の部に見つからない試合は「部不明」になり、別の部の名前を名乗らない', () => {
    const view = buildCourtsView(baseInput({ matches: [match({ divisionId: 'div-unknown' })] }));

    expect(view.courts[0].live!.classLabel.name).toBe('部不明');
  });

  test('チーム番号は折り返さず、そのまま画面に渡す（色の対応は class-labels.ts の 1 か所）', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ sideA: side({ teamNumber: 3, players: [] }) })],
      })
    );

    expect(view.courts[0].live!.teamA.teamNumber).toBe(3);
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
          match({
            matchId: 'm-wait-2',
            status: 'waiting',
            orderInCourt: 3,
            sideA: side({ players: [{ participantId: 'x', orderInPair: 1, name: '三番目' }] }),
          }),
          match({
            matchId: 'm-wait-1',
            status: 'waiting',
            orderInCourt: 2,
            sideA: side({ players: [{ participantId: 'y', orderInPair: 1, name: '二番目' }] }),
          }),
        ],
      })
    );

    expect(view.courts[0].next!.teamA.players).toEqual(['二番目']);
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
});

describe('いまの段と「◯/◯ 試合消化」（件数だけで出す）', () => {
  test('決勝の試合がまだ全部waitingなら予選リーグが現在の段になる', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ matchId: 'm-2', status: 'waiting', stageId: 'stage-knockout' })],
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6, doneMatches: 6 }),
          stage({ id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20, totalMatches: 4 }),
        ],
      })
    );

    expect(view.stageLabel).toBe('予選リーグ');
    expect(view.completedMatches).toBe(6);
    expect(view.totalMatches).toBe(6);
  });

  test('消化数は現在の段の件数をそのまま使う', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ status: 'live', stageId: 'stage-league' })],
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6, doneMatches: 2 }),
          stage({ id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20, totalMatches: 4 }),
        ],
      })
    );

    expect(view.stageLabel).toBe('予選リーグ');
    expect(view.completedMatches).toBe(2);
    expect(view.totalMatches).toBe(6);
  });

  test('決勝の試合が 1 つ進行中になれば、ラベルと消化数が決勝トーナメントに切り替わる', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ matchId: 'm-3', status: 'live', stageId: 'stage-knockout' })],
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6, doneMatches: 5 }),
          stage({ id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20, totalMatches: 4 }),
        ],
      })
    );

    expect(view.stageLabel).toBe('決勝トーナメント');
    expect(view.completedMatches).toBe(0);
    expect(view.totalMatches).toBe(4);
  });

  test('決勝の試合が終わっただけ（進行中はもう無い）でも、決勝トーナメントのまま', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [],
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6, doneMatches: 6 }),
          stage({
            id: 'stage-knockout',
            name: '決勝トーナメント',
            sortOrder: 20,
            totalMatches: 4,
            doneMatches: 1,
          }),
        ],
      })
    );

    expect(view.stageLabel).toBe('決勝トーナメント');
    expect(view.completedMatches).toBe(1);
  });

  test('どの段の試合もまだ始まっていなければ、並び順が最初の段になる', () => {
    const view = buildCourtsView(
      baseInput({
        matches: [match({ status: 'waiting', stageId: 'stage-knockout' })],
        stages: [
          stage({ id: 'stage-knockout', name: '決勝トーナメント', sortOrder: 20, totalMatches: 4 }),
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 6 }),
        ],
      })
    );

    expect(view.stageLabel).toBe('予選リーグ');
    expect(view.completedMatches).toBe(0);
    expect(view.totalMatches).toBe(6);
  });

  test('100 件を超える大会でも、渡された件数どおりの数が出る', () => {
    const view = buildCourtsView(
      baseInput({
        stages: [
          stage({ id: 'stage-league', name: '予選リーグ', totalMatches: 130, doneMatches: 117 }),
        ],
      })
    );

    expect(view.completedMatches).toBe(117);
    expect(view.totalMatches).toBe(130);
  });

  test('段が 1 つも無ければ、ラベルは空で 0/0', () => {
    const view = buildCourtsView(baseInput({ matches: [], stages: [] }));

    expect(view).toMatchObject({ stageLabel: '', completedMatches: 0, totalMatches: 0 });
  });
});

describe('上限を超えて読み切れなかったとき', () => {
  test('読み込みが「上限を超えた」と伝えてきたら、その印をそのまま画面に渡す', () => {
    expect(buildCourtsView(baseInput({ truncated: true })).truncated).toBe(true);
    expect(buildCourtsView(baseInput({ truncated: false })).truncated).toBe(false);
  });
});
