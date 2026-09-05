/**
 * 終了した試合の一覧から、通算成績を出す。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-05-me-real-data.md
 */

import { matchOutcome, type GameScore } from '@/domain/match-rules';

/** 終了した 1 試合ぶんの記録。マイページの成績集計に渡す最小限の形。 */
export type FinishedMatchRecord = {
  maxGameCount: number;
  gameScores: GameScore[];
  /** その試合で自分がどちら側だったか。 */
  mySide: 'A' | 'B';
};

export type PlayerRecord = {
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  /** 自分の取った点 − 相手の取った点。全ゲームの通算。 */
  pointDiff: number;
};

/**
 * 実際にプレーされたゲームだけを残す（0 対 0 のゲームを除く）。
 * `src/domain/scoring.ts` の `playedGameScores` と同じ考え方
 * （バドミントンに 0 対 0 で終わるゲームは無い）。
 */
function playedGames(scores: GameScore[]): GameScore[] {
  return scores.filter(([scoreA, scoreB]) => scoreA > 0 || scoreB > 0);
}

/** 試合が終了した試合の一覧から「◯勝◯敗」「ゲーム ◯-◯」「得失点 ±◯」を計算する。 */
export function buildPlayerRecord(matches: FinishedMatchRecord[]): PlayerRecord {
  let wins = 0;
  let losses = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  let pointDiff = 0;

  for (const match of matches) {
    const played = playedGames(match.gameScores);
    const outcome = matchOutcome(played, match.maxGameCount);
    const [wonByA, wonByB] = outcome.wonGames;
    const isSideA = match.mySide === 'A';

    gamesWon += isSideA ? wonByA : wonByB;
    gamesLost += isSideA ? wonByB : wonByA;

    if (outcome.winner === match.mySide) wins += 1;
    else if (outcome.winner !== null) losses += 1;

    for (const [scoreA, scoreB] of played) {
      pointDiff += isSideA ? scoreA - scoreB : scoreB - scoreA;
    }
  }

  return { wins, losses, gamesWon, gamesLost, pointDiff };
}
