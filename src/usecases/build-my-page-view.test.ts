import { describe, expect, test } from 'vitest';
import {
  buildMyPageView,
  type MyPageViewInput,
  type MyPageViewMatchRow,
} from '@/usecases/build-my-page-view';

const ME = 'p-me';
const PARTNER = 'p-partner';
const OPPONENT_1 = 'p-opp-1';
const OPPONENT_2 = 'p-opp-2';

const DIVISIONS = [
  { id: 'div-1', sortOrder: 10 },
  { id: 'div-2', sortOrder: 20 },
  { id: 'div-3', sortOrder: 30 },
  { id: 'div-4', sortOrder: 40 },
];

function baseInput(overrides: Partial<MyPageViewInput> = {}): MyPageViewInput {
  return {
    myParticipantId: ME,
    profile: {
      name: 'さとう',
      teamNumber: 1,
      teamName: '愛知南',
      divisionId: 'div-1',
    },
    divisions: DIVISIONS,
    matches: [],
    ...overrides,
  };
}

function doubles(overrides: Partial<MyPageViewMatchRow> = {}): MyPageViewMatchRow {
  return {
    matchId: 'match-1',
    status: 'done',
    maxGameCount: 1,
    courtNumber: 1,
    orderInCourt: 1,
    divisionId: 'div-1',
    roundName: '予選 1回戦',
    players: [
      { participantId: ME, side: 'a', orderInPair: 1, name: 'さとう' },
      { participantId: PARTNER, side: 'a', orderInPair: 2, name: 'すずき' },
      { participantId: OPPONENT_1, side: 'b', orderInPair: 1, name: 'わたなべ' },
      { participantId: OPPONENT_2, side: 'b', orderInPair: 2, name: 'こばやし' },
    ],
    gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
    ...overrides,
  };
}

describe('buildMyPageView の部のラベル', () => {
  test('divisions.sortOrder の小さい順に 1部/2部/3部を当てる', () => {
    const view = buildMyPageView(baseInput());
    expect(view.profile.classLabel).toBe('1部');

    const view2部 = buildMyPageView(
      baseInput({ profile: { ...baseInput().profile, divisionId: 'div-2' } })
    );
    expect(view2部.profile.classLabel).toBe('2部');
  });

  test('4 つ目以降の部も 3部になる', () => {
    const view = buildMyPageView(
      baseInput({ profile: { ...baseInput().profile, divisionId: 'div-4' } })
    );
    expect(view.profile.classLabel).toBe('3部');
  });

  test('部が割り当てられていなければ null になる', () => {
    const view = buildMyPageView(
      baseInput({ profile: { ...baseInput().profile, divisionId: null } })
    );
    expect(view.profile.classLabel).toBeNull();
  });
});

describe('buildMyPageView のチーム色', () => {
  test('team_number をそのまま 1〜4 として使う', () => {
    const view = buildMyPageView(baseInput({ profile: { ...baseInput().profile, teamNumber: 3 } }));
    expect(view.profile.teamNumber).toBe(3);
  });

  test('4 を超える team_number は 1〜4 に折り返す', () => {
    const view = buildMyPageView(baseInput({ profile: { ...baseInput().profile, teamNumber: 5 } }));
    expect(view.profile.teamNumber).toBe(1);

    const view2 = buildMyPageView(
      baseInput({ profile: { ...baseInput().profile, teamNumber: 8 } })
    );
    expect(view2.profile.teamNumber).toBe(4);
  });

  test('チーム無しは null になる', () => {
    const view = buildMyPageView(
      baseInput({ profile: { ...baseInput().profile, teamNumber: null, teamName: null } })
    );
    expect(view.profile.teamNumber).toBeNull();
    expect(view.profile.teamName).toBeNull();
  });
});

describe('buildMyPageView の試合の並び', () => {
  test('進行中 → 未実施（コート・順番の若い順）→ 終了 の順に並ぶ', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({ matchId: 'done-1', status: 'done' }),
          doubles({
            matchId: 'waiting-court2',
            status: 'waiting',
            courtNumber: 2,
            orderInCourt: 1,
          }),
          doubles({ matchId: 'live-1', status: 'live' }),
          doubles({
            matchId: 'waiting-court1-2',
            status: 'waiting',
            courtNumber: 1,
            orderInCourt: 2,
          }),
          doubles({
            matchId: 'waiting-court1-1',
            status: 'waiting',
            courtNumber: 1,
            orderInCourt: 1,
          }),
        ],
      })
    );

    expect(view.matches.map((m) => m.id)).toEqual([
      'live-1',
      'waiting-court1-1',
      'waiting-court1-2',
      'waiting-court2',
      'done-1',
    ]);
  });

  test('コートが未定の未実施試合は、未実施の中でも最後に並ぶ', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({
            matchId: 'waiting-no-court',
            status: 'waiting',
            courtNumber: null,
            orderInCourt: null,
          }),
          doubles({
            matchId: 'waiting-court1',
            status: 'waiting',
            courtNumber: 1,
            orderInCourt: 1,
          }),
        ],
      })
    );

    expect(view.matches.map((m) => m.id)).toEqual(['waiting-court1', 'waiting-no-court']);
  });

  // DB は行を返す順番を約束しない。ここで決めておかないと、同じ状態の試合の並びが
  // 開き直すたびに入れ替わって見える。
  test('終了した試合どうしも、読んだ順番によらず同じ並びになる', () => {
    const finished = [
      doubles({ matchId: 'done-b', status: 'done', courtNumber: 1, orderInCourt: 2 }),
      doubles({ matchId: 'done-a', status: 'done', courtNumber: 1, orderInCourt: 1 }),
      doubles({ matchId: 'done-c', status: 'done', courtNumber: 2, orderInCourt: 1 }),
    ];

    const view = buildMyPageView(baseInput({ matches: finished }));
    const reversed = buildMyPageView(baseInput({ matches: [...finished].reverse() }));

    expect(view.matches.map((m) => m.id)).toEqual(['done-a', 'done-b', 'done-c']);
    expect(reversed.matches.map((m) => m.id)).toEqual(view.matches.map((m) => m.id));
  });
});

describe('buildMyPageView のコート表示', () => {
  test('コート未定の未実施試合は courtNumber が null になる', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({ matchId: 'm1', status: 'waiting', courtNumber: null, orderInCourt: null }),
        ],
      })
    );

    expect(view.matches[0].courtNumber).toBeNull();
  });

  test('コートが決まっている未実施試合は courtNumber と orderInCourt が出る', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [doubles({ matchId: 'm1', status: 'waiting', courtNumber: 3, orderInCourt: 2 })],
      })
    );

    expect(view.matches[0].courtNumber).toBe(3);
    expect(view.matches[0].orderInCourt).toBe(2);
  });
});

describe('buildMyPageView のペアの相手', () => {
  test('同じ side のもう 1 人がペアの相手になる', () => {
    const view = buildMyPageView(baseInput({ matches: [doubles({ matchId: 'm1' })] }));
    expect(view.matches[0].partnerName).toBe('すずき');
  });

  test('同じ side に自分しかいなければシングルス（partnerName が無い）', () => {
    const singles = doubles({
      matchId: 'm1',
      players: [
        { participantId: ME, side: 'a', orderInPair: 1, name: 'さとう' },
        { participantId: OPPONENT_1, side: 'b', orderInPair: 1, name: 'わたなべ' },
      ],
    });
    const view = buildMyPageView(baseInput({ matches: [singles] }));
    expect(view.matches[0].partnerName).toBeUndefined();
  });

  test('対戦相手の名前が出る', () => {
    const view = buildMyPageView(baseInput({ matches: [doubles({ matchId: 'm1' })] }));
    expect(view.matches[0].opponentNames).toEqual(['わたなべ', 'こばやし']);
  });

  test('試合の部・回戦が出る', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [doubles({ matchId: 'm1', divisionId: 'div-2', roundName: '予選 2回戦' })],
      })
    );
    expect(view.matches[0].classLabel).toBe('2部');
    expect(view.matches[0].roundLabel).toBe('予選 2回戦');
  });
});

describe('buildMyPageView の試合カードの勝敗・得点', () => {
  test('終了した試合の勝敗印とゲーム数・得点が自分から見た形で出る', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({
            matchId: 'm1',
            status: 'done',
            maxGameCount: 1,
            gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
          }),
        ],
      })
    );

    expect(view.matches[0]).toMatchObject({
      status: 'done',
      won: true,
      gamesWon: 1,
      gamesLost: 0,
      gameScores: [[15, 11]],
    });
  });

  test('自分が B 側の試合は、得点が B 側基準（自分の点、相手の点）で出る', () => {
    const bSide = doubles({
      matchId: 'm1',
      status: 'done',
      maxGameCount: 1,
      players: [
        { participantId: OPPONENT_1, side: 'a', orderInPair: 1, name: 'わたなべ' },
        { participantId: OPPONENT_2, side: 'a', orderInPair: 2, name: 'こばやし' },
        { participantId: ME, side: 'b', orderInPair: 1, name: 'さとう' },
        { participantId: PARTNER, side: 'b', orderInPair: 2, name: 'すずき' },
      ],
      gameScores: [{ gameNumber: 1, sideAScore: 11, sideBScore: 15 }],
    });
    const view = buildMyPageView(baseInput({ matches: [bSide] }));

    expect(view.matches[0]).toMatchObject({ won: true, gameScores: [[15, 11]] });
  });

  // 2 ゲーム目は進行中なのに、点だけ見ると 2 ゲーム取ったように見える形をわざと使う。
  test('進行中の試合にはゲーム数を出さず、各ゲームの得点だけ出す', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({
            matchId: 'm1',
            status: 'live',
            maxGameCount: 3,
            gameScores: [
              { gameNumber: 1, sideAScore: 21, sideBScore: 17 },
              { gameNumber: 2, sideAScore: 5, sideBScore: 3 },
            ],
          }),
        ],
      })
    );

    expect(view.matches[0].gamesWon).toBeUndefined();
    expect(view.matches[0].gamesLost).toBeUndefined();
    expect(view.matches[0].won).toBeUndefined();
    expect(view.matches[0].gameScores).toEqual([
      [21, 17],
      [5, 3],
    ]);
  });

  test('未実施の試合には勝敗もゲーム数も付かない', () => {
    const view = buildMyPageView(
      baseInput({ matches: [doubles({ matchId: 'm1', status: 'waiting', gameScores: [] })] })
    );

    expect(view.matches[0].won).toBeUndefined();
    expect(view.matches[0].gamesWon).toBeUndefined();
    expect(view.matches[0].gameScores).toBeUndefined();
  });

  test('0 対 0 のゲームは各ゲームの得点に出さない', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({
            matchId: 'm1',
            status: 'live',
            maxGameCount: 3,
            gameScores: [
              { gameNumber: 1, sideAScore: 21, sideBScore: 17 },
              { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
            ],
          }),
        ],
      })
    );

    expect(view.matches[0].gameScores).toEqual([[21, 17]]);
  });
});

describe('buildMyPageView は自分が出る試合だけを出す', () => {
  test('自分が出ていない試合は「今大会の試合」に並ばない', () => {
    const notMine = doubles({
      matchId: 'not-mine',
      players: [
        { participantId: PARTNER, side: 'a', orderInPair: 1, name: 'すずき' },
        { participantId: OPPONENT_1, side: 'b', orderInPair: 1, name: 'わたなべ' },
      ],
    });
    const view = buildMyPageView(baseInput({ matches: [doubles({ matchId: 'mine' }), notMine] }));

    expect(view.matches.map((m) => m.id)).toEqual(['mine']);
  });

  test('自分が出ていない試合は成績にも入らない', () => {
    const notMine = doubles({
      matchId: 'not-mine',
      status: 'done',
      maxGameCount: 1,
      players: [
        { participantId: PARTNER, side: 'a', orderInPair: 1, name: 'すずき' },
        { participantId: OPPONENT_1, side: 'b', orderInPair: 1, name: 'わたなべ' },
      ],
      gameScores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 0 }],
    });
    const view = buildMyPageView(baseInput({ matches: [notMine] }));

    expect(view.record).toEqual({ wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointDiff: 0 });
  });
});

describe('buildMyPageView の成績（終了した試合だけで計算する）', () => {
  test('進行中・未実施の試合は成績に混ぜない', () => {
    const view = buildMyPageView(
      baseInput({
        matches: [
          doubles({
            matchId: 'done-1',
            status: 'done',
            maxGameCount: 1,
            gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
          }),
          doubles({
            matchId: 'live-1',
            status: 'live',
            maxGameCount: 1,
            gameScores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 0 }],
          }),
          doubles({ matchId: 'waiting-1', status: 'waiting', gameScores: [] }),
        ],
      })
    );

    expect(view.record).toEqual({ wins: 1, losses: 0, gamesWon: 1, gamesLost: 0, pointDiff: 4 });
  });

  test('試合が 1 件も無いときは 0勝0敗になる', () => {
    const view = buildMyPageView(baseInput({ matches: [] }));
    expect(view.record).toEqual({ wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, pointDiff: 0 });
  });
});
