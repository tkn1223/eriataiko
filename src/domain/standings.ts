/**
 * 対戦（チーム対チーム）の勝敗と、順位表の計算。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-21-standings.md
 *
 * 型の名前は表の名前にそろえる（matchups.side_a_team_id / matches.max_game_count /
 * game_scores / matches.status）。3-b で DB の行から組み立てやすくするため。
 */

import { leadingSide, matchOutcome } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';

/** matches の 1 行。順位計算に要るぶんだけ持つ。 */
export type MatchInput = {
  maxGameCount: number;
  gameScores: GameScore[];
  /**
   * 'waiting' | 'live' | 'done'（DB の check 制約で保証されている）。'done' 以外は未終了として扱う。
   * DB の行は status が string なので、ここも string にして 3-b で型合わせが要らないようにする
   * （usecases/save-score.ts の MatchForScoring と同じ扱い）。
   */
  status: string;
};

/** 対戦（matchups の 1 行）の結果。wonMatches は [A の勝ち試合数, B の勝ち試合数]。 */
export type MatchupResult = {
  finished: boolean;
  winner: 'A' | 'B' | null;
  wonMatches: [number, number];
};

/** その試合が終わっているか。DB の status をここ 1 か所で判断する。 */
function isDone(match: MatchInput): boolean {
  return match.status === 'done';
}

/**
 * 終わった 1 試合の勝者を返す。同数（＝どちらも勝っていない）は null。
 *
 * matchOutcome の wonGames を leadingSide に通して決める（outcome.winner ではない）。
 * 上限ゲーム数ぶんの枠を消化せずに終了した試合（決勝を 1-0 で終える等）では
 * matchOutcome.winner はまだ null のまま。leadingSide ならゲーム数の多いほうを拾える
 * （player-record.ts と同じ理由。終了は人が押したときだけなので枠が余ることがある）。
 */
function winnerOfMatch(match: MatchInput): 'A' | 'B' | null {
  return leadingSide(matchOutcome(match.gameScores, match.maxGameCount).wonGames);
}

/**
 * 対戦の中の試合一覧から、その対戦の結果を返す。
 *
 * 中の試合が 1 つでも終わっていなければ、勝ちは決まっていない扱い（決めたこと 2）。
 */
export function matchupResult(matches: MatchInput[]): MatchupResult {
  let wonByA = 0;
  let wonByB = 0;
  for (const match of matches) {
    if (!isDone(match)) continue;

    const winner = winnerOfMatch(match);
    if (winner === 'A') wonByA += 1;
    if (winner === 'B') wonByB += 1;
  }
  const wonMatches: [number, number] = [wonByA, wonByB];

  const allDone = matches.length > 0 && matches.every(isDone);
  if (!allDone) {
    return { finished: false, winner: null, wonMatches };
  }

  // 勝ち試合数が同数なら引き分け（決めたこと 3）。leadingSide の null が引き分けを兼ねる。
  return { finished: true, winner: leadingSide(wonMatches), wonMatches };
}

/** matchups の 1 行。順位計算に要るぶんだけ持つ。 */
export type MatchupInput = {
  sideATeamId: string;
  sideBTeamId: string;
  matches: MatchInput[];
};

/** teams の 1 行。順位計算に要るぶんだけ持つ。 */
export type TeamInput = {
  teamId: string;
};

/**
 * 順位表の 1 行。画面の行（src/ui/bracket/sample-data.ts の StandingRow）とは別物で、
 * こちらはチーム番号や強調表示を持たない（チームの識別は teamId だけ）。
 */
export type TeamStanding = {
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

type Totals = Omit<TeamStanding, 'rank'>;

function emptyTotals(teamId: string): Totals {
  return { teamId, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesLost: 0, pointDiff: 0 };
}

/** 対戦 1 つぶんの、A 側から見たゲーム数と得点差。B 側は左右を入れ替えるだけ。 */
type MatchupTally = {
  gamesWonByA: number;
  gamesWonByB: number;
  pointDiffForA: number;
};

/** 終了した試合だけを集計する（進行中・未実施は数えない。決めたこと 4）。 */
function tallyDoneMatches(matches: MatchInput[]): MatchupTally {
  let gamesWonByA = 0;
  let gamesWonByB = 0;
  let pointDiffForA = 0;

  for (const match of matches) {
    if (!isDone(match)) continue;

    // 0 対 0 のゲーム（＝まだ行われていない枠）を除く判断は playedGameScores だけに任せる。
    // ここで自前に除くと、scoring.ts と二重管理になる（PR #53 レビュー指摘2）。
    const played = playedGameScores(match.gameScores);
    const [wonByA, wonByB] = matchOutcome(played, match.maxGameCount).wonGames;
    gamesWonByA += wonByA;
    gamesWonByB += wonByB;

    for (const game of played) {
      pointDiffForA += game.sideAScore - game.sideBScore;
    }
  }

  return { gamesWonByA, gamesWonByB, pointDiffForA };
}

/** 対戦 1 つぶんの成績を、その片側のチームの通算に足す。 */
function addMatchup(
  totals: Totals,
  outcome: 'win' | 'loss' | 'draw',
  gamesWon: number,
  gamesLost: number,
  pointDiff: number
): void {
  if (outcome === 'win') totals.wins += 1;
  else if (outcome === 'loss') totals.losses += 1;
  else totals.draws += 1;

  totals.gamesWon += gamesWon;
  totals.gamesLost += gamesLost;
  totals.pointDiff += pointDiff;
}

/**
 * 順位づけに使う物差し。勝ち数 → ゲーム勝ち − 負け → 得失点。
 *
 * 1 つ目に「勝ち数 − 負け数」を使わないのは、途中経過で 2 勝 2 敗と
 * まだ 1 試合もしていない 0 勝 0 敗が同じ順位に見えてしまうため（yosuke さん判断）。
 * 予選は全チームが同じ数だけ対戦するので、終わったときの並びはどちらでも変わらない。
 */
function rankKey(totals: Totals): [number, number, number] {
  return [totals.wins, totals.gamesWon - totals.gamesLost, totals.pointDiff];
}

/**
 * 順位の上下を返す（並べ替えにも同順位の判定にも使う）。
 * 0 なら「3 つとも同じ＝同順位」。2 か所に書くと片方だけ直して食い違うので 1 つにまとめる。
 */
function compareByRankKey(a: Totals, b: Totals): number {
  const keyA = rankKey(a);
  const keyB = rankKey(b);
  for (let i = 0; i < keyA.length; i += 1) {
    if (keyA[i] !== keyB[i]) return keyB[i] - keyA[i];
  }
  return 0;
}

/**
 * チームの一覧と対戦の一覧から、順位表を返す。
 *
 * 数えるのは終わった対戦だけ（決めたこと 4）。同順位は人数ぶん順位を飛ばす
 * （例: 1, 2, 2, 4）。並びが完全に同じ場合は入力順を保つ（安定ソート）。
 */
export function buildStandings(teams: TeamInput[], matchups: MatchupInput[]): TeamStanding[] {
  const totalsByTeamId = new Map<string, Totals>();
  const allTotals = teams.map((team) => {
    const totals = emptyTotals(team.teamId);
    totalsByTeamId.set(team.teamId, totals);
    return totals;
  });

  for (const matchup of matchups) {
    const result = matchupResult(matchup.matches);
    if (!result.finished) continue;

    const tally = tallyDoneMatches(matchup.matches);

    // teams に無いチーム（別の部の大会の対戦が混ざった等）は数えようがないので、
    // 分かっている側だけ足す。相手が居なくても自チームの成績は変わらない。
    const sideA = totalsByTeamId.get(matchup.sideATeamId);
    const sideB = totalsByTeamId.get(matchup.sideBTeamId);
    if (sideA) {
      const outcome = result.winner === null ? 'draw' : result.winner === 'A' ? 'win' : 'loss';
      addMatchup(sideA, outcome, tally.gamesWonByA, tally.gamesWonByB, tally.pointDiffForA);
    }
    if (sideB) {
      const outcome = result.winner === null ? 'draw' : result.winner === 'B' ? 'win' : 'loss';
      addMatchup(sideB, outcome, tally.gamesWonByB, tally.gamesWonByA, -tally.pointDiffForA);
    }
  }

  // Array.prototype.sort は安定ソート（ECMA-262）なので、物差しが同じチームは入力順のまま残る。
  const sorted = [...allTotals].sort(compareByRankKey);

  const rows: TeamStanding[] = [];
  for (const [index, totals] of sorted.entries()) {
    // 同順位は人数ぶん順位を飛ばす: 直前と物差しが同じなら同じ順位、違えば「何番目か」がそのまま順位。
    const isTiedWithPrevious = index > 0 && compareByRankKey(sorted[index - 1], totals) === 0;
    rows.push({ ...totals, rank: isTiedWithPrevious ? rows[index - 1].rank : index + 1 });
  }
  return rows;
}
