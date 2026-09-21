/**
 * 経緯: docs/specs/2026-09-21-standings.md
 *
 * 受け入れ基準をそのままテスト名にしている。実装前にこのファイルを走らせて
 * 赤（失敗）になることを確かめてから src/domain/standings.ts を書いた。
 */
import { describe, expect, test } from 'vitest';
import {
  matchupResult,
  buildStandings,
  type MatchInput,
  type MatchupInput,
} from '@/domain/standings';
import type { GameScore } from '@/domain/scoring';

/** 0-0 の枠を挟まず、played なゲームだけを渡す最短のヘルパー。 */
function game(gameNumber: number, sideAScore: number, sideBScore: number): GameScore {
  return { gameNumber, sideAScore, sideBScore };
}

/** matchupResult に渡す「終わった試合」を組み立てる。maxGameCount は 1 固定（予選想定）。 */
function doneMatch(sideAScore: number, sideBScore: number, maxGameCount = 1): MatchInput {
  return {
    maxGameCount,
    gameScores: [game(1, sideAScore, sideBScore)],
    status: 'done',
  };
}

describe('matchupResult（対戦 1 つの結果）', () => {
  test('対戦の中の試合が全部終わっていれば、勝ち試合数の多いチームがその対戦の勝ちになる', () => {
    const result = matchupResult([doneMatch(21, 10), doneMatch(21, 15), doneMatch(10, 21)]);

    expect(result).toEqual({ finished: true, winner: 'A', wonMatches: [2, 1] });
  });

  test('中の試合が 1 つでも終わっていなければ、その対戦の勝ちは決まっていない扱いになる', () => {
    const result = matchupResult([
      doneMatch(21, 10),
      { maxGameCount: 1, gameScores: [game(1, 15, 12)], status: 'live' },
    ]);

    expect(result.finished).toBe(false);
    expect(result.winner).toBeNull();
  });

  test('中の勝ち数が同数のとき、引き分け（どちらも勝ちでも負けでもない）になる', () => {
    const result = matchupResult([doneMatch(21, 10), doneMatch(10, 21)]);

    expect(result).toEqual({ finished: true, winner: null, wonMatches: [1, 1] });
  });

  test('0 対 0 のゲームは数えない（既存の playedGameScores を通す）', () => {
    // 上限 3 ゲームの枠のうち、まだ行われていない 2 ゲーム目・3 ゲーム目は 0 対 0 のまま。
    const match: MatchInput = {
      maxGameCount: 3,
      gameScores: [game(1, 21, 15), game(2, 0, 0), game(3, 0, 0)],
      status: 'done',
    };

    const result = matchupResult([match]);

    expect(result).toEqual({ finished: true, winner: 'A', wonMatches: [1, 0] });
  });

  test('上限 3 ゲームの試合を 1-0 で終了したとき、その試合はゲームを多く取った側の勝ちになる', () => {
    const match: MatchInput = {
      maxGameCount: 3,
      gameScores: [game(1, 21, 19), game(2, 0, 0), game(3, 0, 0)],
      status: 'done',
    };

    const result = matchupResult([match]);

    expect(result).toEqual({ finished: true, winner: 'A', wonMatches: [1, 0] });
  });

  test('対戦の中の試合が 0 件なら、勝ちは決まっていない扱いになる', () => {
    const result = matchupResult([]);

    expect(result).toEqual({ finished: false, winner: null, wonMatches: [0, 0] });
  });

  test('0 対 0 だけの試合（まだ 1 点も入っていない）は終わっていても勝敗が付かない', () => {
    const match: MatchInput = {
      maxGameCount: 1,
      gameScores: [game(1, 0, 0)],
      status: 'done',
    };

    const result = matchupResult([match]);

    expect(result).toEqual({ finished: true, winner: null, wonMatches: [0, 0] });
  });
});

describe('buildStandings（順位表）', () => {
  const teamA = { teamId: 'team-a' };
  const teamB = { teamId: 'team-b' };
  const teamC = { teamId: 'team-c' };
  const teamD = { teamId: 'team-d' };
  const teamE = { teamId: 'team-e' };
  const teamF = { teamId: 'team-f' };

  function matchup(sideATeamId: string, sideBTeamId: string, matches: MatchInput[]): MatchupInput {
    return { sideATeamId, sideBTeamId, matches };
  }

  test('順位表の勝敗は、終わった対戦だけで数えられる（進行中・未実施は入らない）', () => {
    const rows = buildStandings(
      [teamA, teamB, teamC],
      [
        matchup('team-a', 'team-b', [doneMatch(21, 10)]),
        matchup('team-a', 'team-c', [
          { maxGameCount: 1, gameScores: [game(1, 15, 12)], status: 'live' },
        ]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const c = rows.find((row) => row.teamId === 'team-c')!;

    expect(a.wins).toBe(1);
    expect(a.losses).toBe(0);
    expect(c.wins).toBe(0);
    expect(c.losses).toBe(0);
  });

  test('順位表のゲーム数・得失点は、終了した試合の全ゲームから計算される', () => {
    const rows = buildStandings(
      [teamA, teamB],
      [
        matchup('team-a', 'team-b', [
          doneMatch(21, 10, 3),
          doneMatch(15, 21, 3),
          doneMatch(21, 18, 3),
        ]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.gamesWon).toBe(2);
    expect(a.gamesLost).toBe(1);
    expect(a.pointDiff).toBe(21 - 10 + (15 - 21) + (21 - 18));
    expect(b.gamesWon).toBe(1);
    expect(b.gamesLost).toBe(2);
    expect(b.pointDiff).toBe(-(21 - 10 + (15 - 21) + (21 - 18)));
  });

  test('2 勝 2 敗のチームは、まだ 1 試合もしていない 0 勝 0 敗のチームより上に来る', () => {
    // 「勝ち数 − 負け数」で並べるとどちらも 0 で並び、ゲーム数・得失点も 0 でそろうため同順位になる。
    // 途中経過でそう見えないよう、並びの 1 つ目は「勝ち数」だけを見る。
    // teamF は対戦が 1 つも終わっていないチーム（まだ 0 勝 0 敗）。
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD, teamE, teamF],
      [
        matchup('team-a', 'team-b', [doneMatch(21, 10)]),
        matchup('team-a', 'team-c', [doneMatch(21, 10)]),
        matchup('team-a', 'team-d', [doneMatch(10, 21)]),
        matchup('team-a', 'team-e', [doneMatch(10, 21)]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const f = rows.find((row) => row.teamId === 'team-f')!;

    expect([a.wins, a.losses]).toEqual([2, 2]);
    expect([f.wins, f.losses]).toEqual([0, 0]);
    // 「勝ち数 − 負け数」では並ばない: 2 チームとも 0 でそろい、ゲーム数も得失点も同じ
    expect(a.wins - a.losses).toBe(f.wins - f.losses);
    expect(a.gamesWon - a.gamesLost).toBe(f.gamesWon - f.gamesLost);
    expect(a.pointDiff).toBe(f.pointDiff);
    expect(a.rank).toBeLessThan(f.rank);
  });

  test('並びは まず 勝ち数 で決まる（ゲーム・得失点で負けていても勝ち数が多いほうが上）', () => {
    // A: 2 勝 0 敗だが、どの試合も 21-19 の接戦。B: 1 勝 0 敗で、ゲームも得失点も A より上。
    // 勝ち数を先に見ていないと B が上に来るので、この 1 件で「勝ち数が最優先」だけを確かめられる。
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD],
      [
        matchup('team-a', 'team-c', [doneMatch(21, 19), doneMatch(21, 19), doneMatch(19, 21)]),
        matchup('team-a', 'team-d', [doneMatch(21, 19), doneMatch(21, 19), doneMatch(19, 21)]),
        matchup('team-b', 'team-c', [doneMatch(21, 0), doneMatch(21, 0), doneMatch(21, 0)]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.wins).toBeGreaterThan(b.wins);
    expect(a.gamesWon - a.gamesLost).toBeLessThan(b.gamesWon - b.gamesLost);
    expect(a.pointDiff).toBeLessThan(b.pointDiff);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  test('勝ち数が同じなら ゲーム で決まる（得失点で負けていてもゲームが多いほうが上）', () => {
    // A・B とも 1 勝 1 敗。A はゲームで勝るが、負けた試合が 0-21 なので得失点では B に劣る。
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD],
      [
        matchup('team-a', 'team-c', [doneMatch(21, 19), doneMatch(21, 19)]),
        matchup('team-a', 'team-d', [doneMatch(0, 21)]),
        matchup('team-b', 'team-c', [doneMatch(21, 0)]),
        matchup('team-b', 'team-d', [doneMatch(19, 21)]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.wins).toBe(b.wins);
    expect(a.gamesWon - a.gamesLost).toBeGreaterThan(b.gamesWon - b.gamesLost);
    expect(a.pointDiff).toBeLessThan(b.pointDiff);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  test('勝ち数もゲームも同じなら 得失点 で決まる', () => {
    // A・B とも 1 勝 1 敗、ゲームも 2-2 で並ぶが、A のほうが得失点で勝る
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD],
      [
        matchup('team-a', 'team-c', [doneMatch(21, 5, 3), doneMatch(21, 5, 3)]),
        matchup('team-a', 'team-d', [doneMatch(10, 21, 3), doneMatch(10, 21, 3)]),
        matchup('team-b', 'team-c', [doneMatch(21, 19, 3), doneMatch(21, 19, 3)]),
        matchup('team-b', 'team-d', [doneMatch(10, 21, 3), doneMatch(10, 21, 3)]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.wins).toBe(b.wins);
    expect(a.gamesWon - a.gamesLost).toBe(b.gamesWon - b.gamesLost);
    expect(a.pointDiff).toBeGreaterThan(b.pointDiff);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  test('3 つとも同じチームは同順位になり、その次のチームの順位が人数ぶん飛ぶ（例: 2,2,4）', () => {
    // A は 2 勝、B と C はまったく同じ成績で並ぶ、D は 0 勝
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD],
      [
        matchup('team-a', 'team-b', [doneMatch(21, 10)]),
        matchup('team-a', 'team-c', [doneMatch(21, 10)]),
        matchup('team-a', 'team-d', [doneMatch(21, 10)]),
        matchup('team-b', 'team-d', [doneMatch(21, 10)]),
        matchup('team-c', 'team-d', [doneMatch(21, 10)]),
      ]
    );

    const rankByTeam = Object.fromEntries(rows.map((row) => [row.teamId, row.rank]));

    expect(rankByTeam['team-a']).toBe(1);
    expect(rankByTeam['team-b']).toBe(2);
    expect(rankByTeam['team-c']).toBe(2);
    expect(rankByTeam['team-d']).toBe(4);
  });

  test('試合が 1 つも終わっていない大会でも、全員 0 勝 0 敗・同順位で返る（エラーにならない）', () => {
    const rows = buildStandings(
      [teamA, teamB],
      [
        matchup('team-a', 'team-b', [
          { maxGameCount: 1, gameScores: [game(1, 15, 12)], status: 'live' },
        ]),
      ]
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.wins).toBe(0);
      expect(row.losses).toBe(0);
      expect(row.draws).toBe(0);
      expect(row.gamesWon).toBe(0);
      expect(row.gamesLost).toBe(0);
      expect(row.pointDiff).toBe(0);
      expect(row.rank).toBe(1);
    }
  });

  test('対戦が 0 件でも、全チームが 0 勝 0 敗・同順位で返る', () => {
    const rows = buildStandings([teamA, teamB, teamC], []);

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.rank === 1)).toBe(true);
  });

  test('対戦の中の勝ち数が同数（引き分け）の対戦は、どちらの勝敗にも数えない', () => {
    const rows = buildStandings(
      [teamA, teamB],
      [matchup('team-a', 'team-b', [doneMatch(21, 10), doneMatch(10, 21)])]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.wins).toBe(0);
    expect(a.losses).toBe(0);
    expect(a.draws).toBe(1);
    expect(b.wins).toBe(0);
    expect(b.losses).toBe(0);
    expect(b.draws).toBe(1);
  });

  test('チーム一覧に無いチームとの対戦は、一覧にあるチームの成績だけに数える', () => {
    const rows = buildStandings(
      [teamA],
      [matchup('team-a', 'team-unknown', [doneMatch(21, 10), doneMatch(21, 15)])]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe(1);
    expect(rows[0].gamesWon).toBe(2);
  });

  test('並びが完全に同じときの返す順番は入力順のまま安定する', () => {
    const rows = buildStandings([teamA, teamB, teamC], []);

    expect(rows.map((row) => row.teamId)).toEqual(['team-a', 'team-b', 'team-c']);
  });
});
