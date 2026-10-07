/**
 * 終了した試合の一覧から、通算成績を出す。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-05-me-real-data.md
 */

import { leadingSide, matchOutcome } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';

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

/** 試合が終了した試合の一覧から「◯勝◯敗」「ゲーム ◯-◯」「得失点 ±◯」を計算する。 */
export function buildPlayerRecord(matches: FinishedMatchRecord[]): PlayerRecord {
  let wins = 0;
  let losses = 0;
  let gamesWon = 0;
  let gamesLost = 0;
  let pointDiff = 0;

  for (const match of matches) {
    // 0 対 0 のゲーム（＝まだ行われていない枠）を除く判断は、`playedGameScores`
    // （src/domain/scoring.ts）だけに任せる。matchOutcome も内部で同じ関数を使うので、
    // ここで自前に除く処理を書くと二重管理になる（PR #53 レビュー指摘2）。
    const played = playedGameScores(match.gameScores);
    const outcome = matchOutcome(played, match.maxGameCount);
    const [wonByA, wonByB] = outcome.wonGames;
    const isSideA = match.mySide === 'A';

    gamesWon += isSideA ? wonByA : wonByB;
    gamesLost += isSideA ? wonByB : wonByA;

    // 勝敗は outcome.winner ではなく leadingSide で決める。**終了は人が押したときだけ**なので、
    // 決勝（上限3ゲーム）を 1-0 のまま終了することがあり、そのとき outcome.winner はまだ null。
    // null のまま数えると、21-15 で勝った人が 0 勝 0 敗になる（PR #53 レビュー）。
    // ゲーム数が同数のときだけ null が返るが、同点では終了できないので終わった試合では起きない
    // （match-rules.ts の canFinishMatch。画面と保存の入口の両方が通す）。
    const winner = leadingSide(outcome.wonGames);
    if (winner === match.mySide) wins += 1;
    else if (winner !== null) losses += 1;

    for (const game of played) {
      pointDiff += isSideA ? game.sideAScore - game.sideBScore : game.sideBScore - game.sideAScore;
    }
  }

  return { wins, losses, gamesWon, gamesLost, pointDiff };
}
