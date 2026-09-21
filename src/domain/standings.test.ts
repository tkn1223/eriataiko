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
  type MatchForResult,
  type MatchupInput,
} from '@/domain/standings';
import type { GameScore } from '@/domain/scoring';

/** 0-0 の枠を挟まず、played なゲームだけを渡す最短のヘルパー。 */
function game(gameNumber: number, sideAScore: number, sideBScore: number): GameScore {
  return { gameNumber, sideAScore, sideBScore };
}

/** matchupResult に渡す「終わった試合」を組み立てる。maxGameCount は 1 固定（予選想定）。 */
function doneMatch(sideAScore: number, sideBScore: number, maxGameCount = 1): MatchForResult {
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
    const match: MatchForResult = {
      maxGameCount: 3,
      gameScores: [game(1, 21, 15), game(2, 0, 0), game(3, 0, 0)],
      status: 'done',
    };

    const result = matchupResult([match]);

    expect(result).toEqual({ finished: true, winner: 'A', wonMatches: [1, 0] });
  });

  test('上限 3 ゲームの試合を 1-0 で終了したとき、その試合はゲームを多く取った側の勝ちになる', () => {
    const match: MatchForResult = {
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
    const match: MatchForResult = {
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

  function matchup(
    sideATeamId: string,
    sideBTeamId: string,
    matches: MatchForResult[]
  ): MatchupInput {
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

  test('並びが 勝敗 の順になる', () => {
    // A: 2 勝 0 敗、B: 1 勝 1 敗、C: 0 勝 2 敗（ゲーム・得失点は同数にそろえて勝敗だけを見る）
    const rows = buildStandings(
      [teamA, teamB, teamC],
      [
        matchup('team-a', 'team-b', [doneMatch(21, 10)]),
        matchup('team-a', 'team-c', [doneMatch(21, 10)]),
        matchup('team-b', 'team-c', [doneMatch(21, 10)]),
      ]
    );

    expect(rows.map((row) => row.teamId)).toEqual(['team-a', 'team-b', 'team-c']);
  });

  test('並びが ゲーム の順になる（勝敗が同じときの次の物差し）', () => {
    // A・B とも 1 勝 1 敗で並ぶが、A のほうがゲームの取りこぼしが少ない
    const rows = buildStandings(
      [teamA, teamB, teamC, teamD],
      [
        matchup('team-a', 'team-c', [doneMatch(21, 0), doneMatch(21, 0)]),
        matchup('team-a', 'team-d', [doneMatch(0, 21)]),
        matchup('team-b', 'team-c', [doneMatch(21, 19)]),
        matchup('team-b', 'team-d', [doneMatch(19, 21), doneMatch(19, 21)]),
      ]
    );

    const a = rows.find((row) => row.teamId === 'team-a')!;
    const b = rows.find((row) => row.teamId === 'team-b')!;

    expect(a.wins - a.losses).toBe(b.wins - b.losses);
    expect(a.gamesWon - a.gamesLost).toBeGreaterThan(b.gamesWon - b.gamesLost);
    expect(rows.indexOf(a)).toBeLessThan(rows.indexOf(b));
  });

  test('並びが 得失点 の順になる（勝敗・ゲームが同じときの最後の物差し）', () => {
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

    expect(a.wins - a.losses).toBe(b.wins - b.losses);
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

  test('並びが完全に同じときの返す順番は入力順のまま安定する', () => {
    const rows = buildStandings([teamA, teamB, teamC], []);

    expect(rows.map((row) => row.teamId)).toEqual(['team-a', 'team-b', 'team-c']);
  });
});
