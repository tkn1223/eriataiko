import { describe, expect, test } from 'vitest';
import {
  buildBracketView,
  type BracketViewInput,
  type BracketViewMatchRow,
  type BracketViewMatchupRow,
} from '@/usecases/build-bracket-view';

/**
 * 対戦表（/bracket）を DB の行から組み立てる計算を、DB を使わずに確かめる。
 * 仕様: docs/specs/2026-10-07-bracket-real-data.md
 *
 * 受け入れ基準をそのままテスト名にしている。実装前にこのファイルを走らせて
 * 赤（失敗）になることを確かめてから src/usecases/build-bracket-view.ts を書いた。
 */

const TEAMS = [
  { id: 'team-1', teamNumber: 1, name: '愛知南', sortOrder: 10 },
  { id: 'team-2', teamNumber: 2, name: '愛知中央', sortOrder: 20 },
  { id: 'team-3', teamNumber: 3, name: '愛知北', sortOrder: 30 },
  { id: 'team-4', teamNumber: 4, name: '愛知西', sortOrder: 40 },
];
const DIVISIONS = [
  { id: 'div-1', name: '1部', sortOrder: 10 },
  { id: 'div-2', name: '2部', sortOrder: 20 },
];

/** 1 ゲームだけの試合（上限 1）。 */
function match(
  id: string,
  status: 'done' | 'live' | 'waiting',
  scores: [number, number] | null,
  overrides: Partial<BracketViewMatchRow> = {}
): BracketViewMatchRow {
  return {
    id,
    status,
    maxGameCount: 1,
    divisionId: 'div-1',
    orderInMatchup: 1,
    players: [],
    gameScores: scores ? [{ gameNumber: 1, sideAScore: scores[0], sideBScore: scores[1] }] : [],
    ...overrides,
  };
}

function leagueMatchup(
  id: string,
  teamA: string,
  teamB: string,
  matches: BracketViewMatchRow[],
  sortOrder = 10
): BracketViewMatchupRow {
  return {
    id,
    stageFormat: 'league',
    stageSortOrder: 10,
    roundName: '予選 1回戦',
    sortOrder,
    sideATeamId: teamA,
    sideBTeamId: teamB,
    sideASlotLabel: null,
    sideBSlotLabel: null,
    matches,
  };
}

function input(
  matchups: BracketViewMatchupRow[],
  overrides: Partial<BracketViewInput> = {}
): BracketViewInput {
  return {
    myTeamId: null,
    divisions: DIVISIONS,
    teams: TEAMS,
    matchups,
    truncated: false,
    ...overrides,
  };
}

describe('星取表のマス（対戦の状態と数字）', () => {
  test('中の試合が全部終わった対戦は「終了」になり、数字は勝ち試合数になる', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'done', [21, 15], { orderInMatchup: 2 }),
          match('c', 'done', [10, 21], { orderInMatchup: 3 }),
        ]),
      ])
    );

    expect(view.leagueCards).toHaveLength(1);
    expect(view.leagueCards[0]).toMatchObject({
      teamA: 1,
      teamB: 2,
      status: 'done',
      gamesWonA: 2,
      gamesWonB: 1,
    });
  });

  test('中の試合が全部まだの対戦は「未」になり、数字は持たない', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'waiting', null),
          match('b', 'waiting', null, { orderInMatchup: 2 }),
        ]),
      ])
    );

    expect(view.leagueCards[0].status).toBe('waiting');
    expect(view.leagueCards[0].gamesWonA).toBeUndefined();
    expect(view.leagueCards[0].gamesWonB).toBeUndefined();
  });

  test('終わった試合と終わっていない試合が混ざる対戦は「試合中」になり、数字は終わった試合だけを数える', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'live', [8, 6], { orderInMatchup: 2 }),
          match('c', 'waiting', null, { orderInMatchup: 3 }),
        ]),
      ])
    );

    expect(view.leagueCards[0]).toMatchObject({ status: 'live', gamesWonA: 1, gamesWonB: 0 });
  });

  test('1 試合が終わり、残りがまだの対戦も「試合中」になる（全部まだではないので）', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'waiting', null, { orderInMatchup: 2 }),
        ]),
      ])
    );

    expect(view.leagueCards[0].status).toBe('live');
  });

  test('中の試合がまだ 1 つも登録されていない対戦は「未」になる', () => {
    const view = buildBracketView(input([leagueMatchup('m1', 'team-1', 'team-2', [])]));

    expect(view.leagueCards[0].status).toBe('waiting');
  });

  test('終わった対戦の勝ち試合数が同じなら、そのマスの数字は同数になる（画面が「△」を出す）', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'done', [10, 21], { orderInMatchup: 2 }),
        ]),
      ])
    );

    expect(view.leagueCards[0]).toMatchObject({ status: 'done', gamesWonA: 1, gamesWonB: 1 });
  });

  test('対戦の相手のチームが決まっていない予選の対戦は、星取表のマスにしない', () => {
    const undecided: BracketViewMatchupRow = {
      ...leagueMatchup('m1', 'team-1', 'team-2', [match('a', 'waiting', null)]),
      sideBTeamId: null,
      sideBSlotLabel: '未定',
    };

    const view = buildBracketView(input([undecided]));

    expect(view.leagueCards).toEqual([]);
  });
});

describe('対戦の詳細（中の試合ごと）', () => {
  const players = [
    { side: 'a', orderInPair: 2, name: '鈴木' },
    { side: 'a', orderInPair: 1, name: '佐藤' },
    { side: 'b', orderInPair: 1, name: '山田' },
    { side: 'b', orderInPair: 2, name: '田中' },
  ];

  test('試合ごとに、部・両ペアの名前（ペアの順）・ゲーム数・状態が入る', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 15], { players }),
          match('b', 'waiting', null, { orderInMatchup: 2, divisionId: 'div-2' }),
        ]),
      ])
    );

    const [first, second] = view.leagueCards[0].matches;
    expect(first).toMatchObject({
      id: 'a',
      classLabel: { name: '1部', colorNumber: 1 },
      status: 'done',
      teamAPlayers: ['佐藤', '鈴木'],
      teamBPlayers: ['山田', '田中'],
      gamesWonA: 1,
      gamesWonB: 0,
    });
    expect(second).toMatchObject({
      id: 'b',
      classLabel: { name: '2部', colorNumber: 2 },
      status: 'waiting',
      teamAPlayers: [],
      teamBPlayers: [],
    });
    expect(second.gamesWonA).toBeUndefined();
  });

  test('試合は order_in_matchup の順に並ぶ', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('late', 'waiting', null, { orderInMatchup: 3 }),
          match('early', 'waiting', null, { orderInMatchup: 1 }),
        ]),
      ])
    );

    expect(view.leagueCards[0].matches.map((m) => m.id)).toEqual(['early', 'late']);
  });

  test('部の色は部の名前ではなく並び順で決まる（class-labels.ts の決めごと）', () => {
    const view = buildBracketView(
      input(
        [leagueMatchup('m1', 'team-1', 'team-2', [match('a', 'waiting', null)])],
        // 並び順の最初の部が「A級」でも、色は 1 番
        { divisions: [{ id: 'div-1', name: 'A級', sortOrder: 5 }] }
      )
    );

    expect(view.leagueCards[0].matches[0].classLabel).toEqual({ name: 'A級', colorNumber: 1 });
  });

  test('部が見つからない試合は「部不明」になる（別の部に見せない）', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'waiting', null, { divisionId: 'div-unknown' }),
        ]),
      ])
    );

    expect(view.leagueCards[0].matches[0].classLabel.name).toBe('部不明');
  });
});

describe('順位表', () => {
  test('buildStandings の結果どおり（勝ち数 → ゲーム → 得失点）に並び、チーム番号が入る', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [match('a', 'done', [10, 21])]),
        leagueMatchup('m2', 'team-3', 'team-4', [match('b', 'done', [21, 19])], 20),
        leagueMatchup('m3', 'team-2', 'team-3', [match('c', 'done', [21, 5])], 30),
      ])
    );

    // team-2: 2 勝 / team-3: 1 勝 1 敗 / team-1・team-4: 0 勝 1 敗（得失点は team-4 が -2、team-1 が -11 で team-1 が下）
    expect(view.standings.map((row) => [row.rank, row.teamNumber, row.wins, row.losses])).toEqual([
      [1, 2, 2, 0],
      [2, 3, 1, 1],
      [3, 4, 0, 1],
      [4, 1, 0, 1],
    ]);
    expect(view.standings[0]).toMatchObject({ gamesWon: 2, gamesLost: 0 });
  });

  test('同率のチームは同じ順位になる', () => {
    const view = buildBracketView(input([]));

    expect(view.standings.map((row) => row.rank)).toEqual([1, 1, 1, 1]);
  });

  test('引き分けの数を持つ（画面が、引き分けのあるチームだけ「◯分」を出す）', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'done', [10, 21], { orderInMatchup: 2 }),
        ]),
      ])
    );

    const team1 = view.standings.find((row) => row.teamNumber === 1)!;
    const team3 = view.standings.find((row) => row.teamNumber === 3)!;
    expect(team1).toMatchObject({ wins: 0, losses: 0, draws: 1 });
    expect(team3.draws).toBe(0);
  });

  test('終わっていない対戦は順位表に数えない', () => {
    const view = buildBracketView(
      input([
        leagueMatchup('m1', 'team-1', 'team-2', [
          match('a', 'done', [21, 10]),
          match('b', 'live', [3, 0], { orderInMatchup: 2 }),
        ]),
      ])
    );

    expect(view.standings.every((row) => row.wins === 0 && row.losses === 0)).toBe(true);
  });

  test('決勝トーナメントの対戦が終わっていても、予選の順位表の数字も並びも変わらない（#62）', () => {
    const league = [
      leagueMatchup('m1', 'team-1', 'team-2', [match('a', 'done', [21, 10])]),
      leagueMatchup('m2', 'team-3', 'team-4', [match('b', 'done', [21, 19])], 20),
    ];
    // 予選で負けた team-2 が決勝で勝つ（数えてしまうと順位が入れ替わる）
    const knockout: BracketViewMatchupRow = {
      id: 'k1',
      stageFormat: 'knockout',
      stageSortOrder: 20,
      roundName: '決勝',
      sortOrder: 30,
      sideATeamId: 'team-2',
      sideBTeamId: 'team-1',
      sideASlotLabel: null,
      sideBSlotLabel: null,
      matches: [match('k', 'done', [21, 0], { maxGameCount: 3 })],
    };

    const without = buildBracketView(input(league));
    const withKnockout = buildBracketView(input([...league, knockout]));

    expect(withKnockout.standings).toEqual(without.standings);
    // 決勝の対戦は星取表のマスにもならない
    expect(withKnockout.leagueCards).toEqual(without.leagueCards);
  });
});

describe('自分のチームの印', () => {
  const matchups = [leagueMatchup('m1', 'team-1', 'team-2', [match('a', 'done', [21, 10])])];

  test('選手として入った人のチームの行にだけ isSelf が付く', () => {
    const view = buildBracketView(input(matchups, { myTeamId: 'team-3' }));

    expect(view.standings.filter((row) => row.isSelf).map((row) => row.teamNumber)).toEqual([3]);
  });

  test('観戦者（myTeamId が null）にはどの行にも付かない', () => {
    const view = buildBracketView(input(matchups, { myTeamId: null }));

    expect(view.standings.some((row) => row.isSelf)).toBe(false);
  });
});

describe('そのほか', () => {
  test('チームは sort_order の順に並ぶ（星取表の行・列の順）', () => {
    const view = buildBracketView(input([], { teams: [...TEAMS].reverse() }));

    expect(view.teams).toEqual([
      { number: 1, name: '愛知南' },
      { number: 2, name: '愛知中央' },
      { number: 3, name: '愛知北' },
      { number: 4, name: '愛知西' },
    ]);
  });

  test('予選の対戦が 1 つも無ければ hasLeagueMatchups は false', () => {
    expect(buildBracketView(input([])).hasLeagueMatchups).toBe(false);
    expect(
      buildBracketView(input([leagueMatchup('m1', 'team-1', 'team-2', [])])).hasLeagueMatchups
    ).toBe(true);
  });

  test('読む上限を超えていたら truncated がそのまま伝わる', () => {
    expect(buildBracketView(input([], { truncated: true })).truncated).toBe(true);
    expect(buildBracketView(input([], { truncated: false })).truncated).toBe(false);
  });
});

/**
 * 決勝トーナメント（勝ち上がり表）。
 *
 * どの対戦が準決勝・決勝・3位決定戦かは、回戦の呼び方（round_name）ではなく
 * 決勝の段の対戦を sort_order の順に並べた位置で決める（1・2 番目 = 準決勝、3 番目 = 決勝、
 * 4 番目 = 3位決定戦）。仕様の「決勝の見分け方」を参照。
 */
describe('決勝トーナメント（勝ち上がり表）', () => {
  /** 決勝の段の対戦。回戦の呼び方は大会ごとに違うので、わざと見分けのつかない名前にしておく。 */
  function knockoutMatchup(
    id: string,
    sortOrder: number,
    overrides: Partial<BracketViewMatchupRow> = {}
  ): BracketViewMatchupRow {
    return {
      id,
      stageFormat: 'knockout',
      stageSortOrder: 20,
      roundName: `呼び方${id}`,
      sortOrder,
      sideATeamId: null,
      sideBTeamId: null,
      sideASlotLabel: '空枠A',
      sideBSlotLabel: '空枠B',
      matches: [],
      ...overrides,
    };
  }

  const leagueUnfinished = leagueMatchup('l1', 'team-1', 'team-2', [match('l1a', 'waiting', null)]);

  function fourKnockoutMatchups(
    overrides: Partial<Record<'s1' | 's2' | 'final' | 'third', Partial<BracketViewMatchupRow>>> = {}
  ) {
    return [
      knockoutMatchup('s1', 10, overrides.s1),
      knockoutMatchup('s2', 20, overrides.s2),
      knockoutMatchup('final', 30, overrides.final),
      knockoutMatchup('third', 40, overrides.third),
    ];
  }

  function readyKo(matchups: BracketViewMatchupRow[], overrides: Partial<BracketViewInput> = {}) {
    const view = buildBracketView(input([leagueUnfinished, ...matchups], overrides));
    if (view.koBracket.kind !== 'ready') throw new Error(`ready ではない: ${view.koBracket.kind}`);
    return view.koBracket.data;
  }

  test('決勝の段の対戦を sort_order の順に並べ、準決勝2つ・決勝・3位決定戦に割り当てる', () => {
    // 並びを入れ替えて渡しても、sort_order どおりに割り当たる
    const shuffled = [...fourKnockoutMatchups()].reverse();

    const ko = readyKo(shuffled);

    expect(ko.semifinals.map((m) => m.id)).toEqual(['s1', 's2']);
    expect(ko.final.id).toBe('final');
    expect(ko.thirdPlace.id).toBe('third');
  });

  test('回戦の呼び方（round_name）が何であっても、並びだけで割り当たる（名前に頼らない）', () => {
    const named = fourKnockoutMatchups({
      s1: { roundName: '3位決定戦' },
      s2: { roundName: '決勝' },
      final: { roundName: '準決勝1' },
      third: { roundName: 'Semi Final' },
    });

    const ko = readyKo(named);

    expect(ko.semifinals.map((m) => m.id)).toEqual(['s1', 's2']);
    expect(ko.final.id).toBe('final');
    expect(ko.thirdPlace.id).toBe('third');
  });

  test('チームが入っている枠はチーム名（チーム番号つき）、空の枠は空枠の名前（薄字）になる', () => {
    const ko = readyKo(
      fourKnockoutMatchups({
        s1: { sideATeamId: 'team-1', sideASlotLabel: null, sideBSlotLabel: '予選4位' },
      })
    );

    expect(ko.semifinals[0].slotA).toEqual({ label: '愛知南', isDecided: true, teamNumber: 1 });
    expect(ko.semifinals[0].slotB).toEqual({ label: '予選4位', isDecided: false });
  });

  test('チームが入っていれば、空枠の名前が残っていてもチーム名のほうを出す', () => {
    const ko = readyKo(
      fourKnockoutMatchups({ s1: { sideATeamId: 'team-2', sideASlotLabel: '予選1位' } })
    );

    expect(ko.semifinals[0].slotA).toMatchObject({ label: '愛知中央', isDecided: true });
  });

  test('チームも空枠の名前も無い枠は「未定」と出る', () => {
    const ko = readyKo(fourKnockoutMatchups({ s1: { sideASlotLabel: null } }));

    expect(ko.semifinals[0].slotA).toEqual({ label: '未定', isDecided: false });
  });

  test('対戦の状態と数字が、中の試合どおりに出る（終了・試合中・未）', () => {
    const ko = readyKo(
      fourKnockoutMatchups({
        s1: {
          matches: [
            match('k1', 'done', [21, 10], { maxGameCount: 3 }),
            match('k2', 'done', [21, 15], { maxGameCount: 3, orderInMatchup: 2 }),
          ],
        },
        s2: {
          matches: [
            match('k3', 'done', [10, 21], { maxGameCount: 3 }),
            match('k4', 'live', [3, 2], { maxGameCount: 3, orderInMatchup: 2 }),
          ],
        },
      })
    );

    expect(ko.semifinals[0]).toMatchObject({ status: 'done', scoreA: 2, scoreB: 0 });
    expect(ko.semifinals[1]).toMatchObject({ status: 'live', scoreA: 0, scoreB: 1 });
    expect(ko.final.status).toBe('waiting');
    expect(ko.final.scoreA).toBeUndefined();
    expect(ko.final.scoreB).toBeUndefined();
  });

  describe('優勝', () => {
    const finalDoneWonByB = {
      sideATeamId: 'team-1',
      sideBTeamId: 'team-2',
      matches: [match('f1', 'done', [10, 21], { maxGameCount: 3 })],
    };

    test('決勝の対戦が終わって勝ちが決まれば、勝ったチームの名前が入る', () => {
      const ko = readyKo(fourKnockoutMatchups({ final: finalDoneWonByB }));

      expect(ko.champion).toEqual({ decided: true, teamName: '愛知中央' });
    });

    test('決勝の対戦が終わっていなければ、優勝は決まっていない', () => {
      const ko = readyKo(
        fourKnockoutMatchups({
          final: {
            ...finalDoneWonByB,
            matches: [
              match('f1', 'done', [10, 21], { maxGameCount: 3 }),
              match('f2', 'live', [5, 3], { maxGameCount: 3, orderInMatchup: 2 }),
            ],
          },
        })
      );

      expect(ko.champion).toEqual({ decided: false });
    });

    test('決勝の対戦が引き分けなら、優勝は決まっていない', () => {
      const ko = readyKo(
        fourKnockoutMatchups({
          final: {
            ...finalDoneWonByB,
            matches: [
              match('f1', 'done', [21, 10], { maxGameCount: 3 }),
              match('f2', 'done', [10, 21], { maxGameCount: 3, orderInMatchup: 2 }),
            ],
          },
        })
      );

      expect(ko.champion).toEqual({ decided: false });
    });

    test('勝った側にまだチームが入っていなければ、名前が出せないので優勝は決まっていない', () => {
      const ko = readyKo(
        fourKnockoutMatchups({
          final: {
            sideATeamId: 'team-1',
            sideBTeamId: null,
            sideBSlotLabel: '準決勝2 勝者',
            matches: [match('f1', 'done', [10, 21], { maxGameCount: 3 })],
          },
        })
      );

      expect(ko.champion).toEqual({ decided: false });
    });

    test('3位決定戦が終わっていても、優勝は決勝だけで決まる', () => {
      const ko = readyKo(
        fourKnockoutMatchups({
          third: {
            sideATeamId: 'team-3',
            sideBTeamId: 'team-4',
            matches: [match('t1', 'done', [21, 10], { maxGameCount: 3 })],
          },
        })
      );

      expect(ko.champion).toEqual({ decided: false });
    });
  });

  describe('予選リーグが終わったか（注記「組み合わせは予選リーグ終了後に確定します」を出すか）', () => {
    test('予選の対戦のどれかに終わっていない試合が残っていれば、終わっていない', () => {
      expect(readyKo(fourKnockoutMatchups()).leagueFinished).toBe(false);
    });

    test('予選の試合が全部終わっていれば、終わっている', () => {
      const finished = leagueMatchup('l1', 'team-1', 'team-2', [match('l1a', 'done', [21, 10])]);

      const view = buildBracketView(input([finished, ...fourKnockoutMatchups()]));

      expect(view.koBracket).toMatchObject({ kind: 'ready', data: { leagueFinished: true } });
    });

    test('決勝の試合の進み具合は、予選が終わったかに関わらない', () => {
      const finished = leagueMatchup('l1', 'team-1', 'team-2', [match('l1a', 'done', [21, 10])]);
      const knockoutWaiting = fourKnockoutMatchups({
        s1: { matches: [match('k1', 'waiting', null, { maxGameCount: 3 })] },
      });

      const view = buildBracketView(input([finished, ...knockoutWaiting]));

      expect(view.koBracket).toMatchObject({ kind: 'ready', data: { leagueFinished: true } });
    });
  });

  describe('決勝の段の対戦が 4 つでないとき', () => {
    test('1 つも無ければ「まだ登録されていない」になる', () => {
      const view = buildBracketView(input([leagueUnfinished]));

      expect(view.koBracket).toEqual({ kind: 'not-registered' });
    });

    test.each([1, 2, 3, 5])(
      '%i つだと、どれが決勝か決められないので想定外の形になる（件数が入る）',
      (count) => {
        const knockouts = fourKnockoutMatchups().concat([knockoutMatchup('extra', 50)]);

        const view = buildBracketView(input([leagueUnfinished, ...knockouts.slice(0, count)]));

        expect(view.koBracket).toEqual({ kind: 'unexpected-shape', matchupCount: count });
      }
    );

    test.each([
      ['準決勝2 と決勝', { final: { sortOrder: 20 } }],
      ['決勝と3位決定戦', { third: { sortOrder: 30 } }],
    ] as const)(
      '4 つでも並び順（sort_order）が重なっていると（%s）、どれが決勝か決められないので並べない',
      (_label, overrides) => {
        const view = buildBracketView(
          input([leagueUnfinished, ...fourKnockoutMatchups(overrides)])
        );

        expect(view.koBracket).toEqual({ kind: 'duplicate-sort-order' });
      }
    );

    test('予選の対戦は決勝の対戦の数に入らない', () => {
      const view = buildBracketView(
        input([
          leagueUnfinished,
          leagueMatchup('l2', 'team-3', 'team-4', [], 20),
          ...fourKnockoutMatchups(),
        ])
      );

      expect(view.koBracket.kind).toBe('ready');
    });
  });
});
