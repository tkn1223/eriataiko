/**
 * 対戦（チーム対チーム）の勝敗と、順位表の計算。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-21-standings.md
 *
 * 型の名前は表の名前にそろえる（matchups.side_a_team_id / matches.max_game_count /
 * game_scores / matches.status）。3-b で DB の行から組み立てやすくするため。
 */

import { leadingSide, matchOutcome, type MatchOutcome } from '@/domain/match-rules';
import type { GameScore } from '@/domain/scoring';

/** matches の 1 行。順位計算に要るぶんだけ持つ。 */
export type MatchForResult = {
  maxGameCount: number;
  gameScores: GameScore[];
  status: 'waiting' | 'live' | 'done';
};

/** 対戦（matchups の 1 行）の結果。wonMatches は [A の勝ち試合数, B の勝ち試合数]。 */
export type MatchupResult = {
  finished: boolean;
  winner: 'A' | 'B' | null;
  wonMatches: [number, number];
};

/**
 * 対戦の中の試合一覧から、その対戦の結果を返す。
 *
 * 勝敗は matchOutcome の wonGames を leadingSide に通して決める（outcome.winner ではない）。
 * 上限ゲーム数ぶんの枠を消化せずに終了した試合（決勝を 1-0 で終える等）でも、
 * matchOutcome.winner はまだ null のまま。leadingSide ならゲーム数の多いほうを拾える
 * （match-rules.ts / player-record.ts の判断とそろえる。PR #53 と同じ理由）。
 */
export function matchupResult(matches: MatchForResult[]): MatchupResult {
  // 中の試合が 1 つでも終わっていなければ、対戦の勝ちは決まっていない扱い（決めたこと 2）。
  const allDone = matches.length > 0 && matches.every((match) => match.status === 'done');

  let wonByA = 0;
  let wonByB = 0;
  for (const match of matches) {
    if (match.status !== 'done') continue;

    const outcome: MatchOutcome = matchOutcome(match.gameScores, match.maxGameCount);
    const winner = leadingSide(outcome.wonGames);
    if (winner === 'A') wonByA += 1;
    if (winner === 'B') wonByB += 1;
  }
  const wonMatches: [number, number] = [wonByA, wonByB];

  if (!allDone) {
    return { finished: false, winner: null, wonMatches };
  }

  // 勝ち試合数が同数なら引き分け（決めたこと 3）。leadingSide が null と winner: null を兼ねる。
  return { finished: true, winner: leadingSide(wonMatches), wonMatches };
}

/** matchups の 1 行。順位計算に要るぶんだけ持つ。 */
export type MatchupInput = {
  sideATeamId: string;
  sideBTeamId: string;
  matches: MatchForResult[];
};

/** teams の 1 行。順位計算に要るぶんだけ持つ。 */
export type TeamInput = {
  teamId: string;
};

export type StandingRow = {
  teamId: string;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesLost: number;
  /** 自チームの取った点 − 相手の取った点。終了した試合の全ゲームの通算。 */
  pointDiff: number;
  rank: number;
};

type Totals = Omit<StandingRow, 'rank'>;

function emptyTotals(teamId: string): Totals {
  return { teamId, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesLost: 0, pointDiff: 0 };
}

/** 勝敗の順位づけに使う物差し。勝ち − 負け → ゲーム勝ち − 負け → 得失点。 */
function rankKey(totals: Totals): [number, number, number] {
  return [totals.wins - totals.losses, totals.gamesWon - totals.gamesLost, totals.pointDiff];
}

function sameRank(a: Totals, b: Totals): boolean {
  const keyA = rankKey(a);
  const keyB = rankKey(b);
  return keyA[0] === keyB[0] && keyA[1] === keyB[1] && keyA[2] === keyB[2];
}

/**
 * チームの一覧と対戦の一覧から、順位表を返す。
 *
 * 数えるのは終わった対戦だけ（決めたこと 4）。同順位は人数ぶん順位を飛ばす
 * （例: 1, 2, 2, 4）。並びが完全に同じ場合は入力順を保つ（安定ソート）。
 */
export function buildStandings(teams: TeamInput[], matchups: MatchupInput[]): StandingRow[] {
  const totalsByTeamId = new Map<string, Totals>();
  for (const team of teams) {
    totalsByTeamId.set(team.teamId, emptyTotals(team.teamId));
  }

  for (const matchup of matchups) {
    const result = matchupResult(matchup.matches);
    if (!result.finished) continue;

    const sideATotals = totalsByTeamId.get(matchup.sideATeamId);
    const sideBTotals = totalsByTeamId.get(matchup.sideBTeamId);

    // 勝敗（決めたこと 3: 同数は引き分け。どちらの勝敗にも数えない）
    if (result.winner === 'A') {
      if (sideATotals) sideATotals.wins += 1;
      if (sideBTotals) sideBTotals.losses += 1;
    } else if (result.winner === 'B') {
      if (sideBTotals) sideBTotals.wins += 1;
      if (sideATotals) sideATotals.losses += 1;
    } else {
      if (sideATotals) sideATotals.draws += 1;
      if (sideBTotals) sideBTotals.draws += 1;
    }

    // ゲーム数・得失点は終了した試合の全ゲームから（0 対 0 の枠は matchOutcome 経由で除かれる）
    for (const match of matchup.matches) {
      if (match.status !== 'done') continue;

      const outcome = matchOutcome(match.gameScores, match.maxGameCount);
      const [wonByA, wonByB] = outcome.wonGames;

      if (sideATotals) {
        sideATotals.gamesWon += wonByA;
        sideATotals.gamesLost += wonByB;
      }
      if (sideBTotals) {
        sideBTotals.gamesWon += wonByB;
        sideBTotals.gamesLost += wonByA;
      }

      for (const game of match.gameScores) {
        if (game.sideAScore === 0 && game.sideBScore === 0) continue;
        if (sideATotals) sideATotals.pointDiff += game.sideAScore - game.sideBScore;
        if (sideBTotals) sideBTotals.pointDiff += game.sideBScore - game.sideAScore;
      }
    }
  }

  // Array.prototype.sort は安定ソート（ECMA-262）なので、キーが同じチームは入力順のまま残る。
  const sorted = teams
    .map((team) => totalsByTeamId.get(team.teamId) ?? emptyTotals(team.teamId))
    .sort((a, b) => {
      const keyA = rankKey(a);
      const keyB = rankKey(b);
      for (let i = 0; i < keyA.length; i += 1) {
        if (keyA[i] !== keyB[i]) return keyB[i] - keyA[i];
      }
      return 0;
    });

  const rows: StandingRow[] = [];
  for (const [index, totals] of sorted.entries()) {
    // 同順位は人数ぶん順位を飛ばす: 直前と物差しが同じなら同じ順位、違えば「何番目か」がそのまま順位。
    const rank =
      index > 0 && sameRank(sorted[index - 1], totals) ? rows[index - 1].rank : index + 1;
    rows.push({ ...totals, rank });
  }
  return rows;
}
