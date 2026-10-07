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
