/**
 * 得点にまつわる純粋な計算。DB も HTTP も触らない。
 *
 * 経緯: docs/specs/2026-08-29-score-input-backend.md
 */

/** ゲーム 1 つぶんの得点。`game_scores` の 1 行に対応する。 */
export type GameScore = {
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

/**
 * 実際にプレーされたゲームだけを返す（0 対 0 のゲームを除く）。
 *
 * バドミントンに 0 対 0 で終わるゲームは無い。「まだ始まっていない枠」を
 * 「終わったゲーム」と区別するのに、点が入っているかどうかで判定する
 * （仕様書の「決めたこと: 空のゲーム」）。
 */
export function playedGameScores(scores: GameScore[]): GameScore[] {
  return scores.filter((score) => score.sideAScore > 0 || score.sideBScore > 0);
}

/** 1 点でも入っているゲームがあるか。 */
export function hasAnyPoint(scores: GameScore[]): boolean {
  return playedGameScores(scores).length > 0;
}
