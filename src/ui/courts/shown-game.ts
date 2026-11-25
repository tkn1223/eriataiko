import { matchOutcome } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';

/**
 * カードの真ん中に「第Nゲーム」と出し、点を入れる枠にするゲーム。
 *
 * 試合に「いまのゲーム」という印は持っていない（終わるかどうかは人が「試合終了」を押したときだけ。
 * 何点で 1 ゲームが終わるかも部によって違う）。そこで、点が入っているゲームのうち一番後ろを
 * 「いま入れているゲーム」とする。まだ 1 点も無ければ第1ゲーム。
 * 点を入れる人がゲームのタブで切り替える操作は、カード側が覚える（`court-live-card.tsx`）。
 */
export function defaultShownGame(scores: GameScore[], maxGameCount: number): number {
  const lastPlayed = Math.max(0, ...playedGameScores(scores).map((score) => score.gameNumber));
  return Math.min(Math.max(lastPlayed, 1), Math.max(maxGameCount, 1));
}

/** 出しているゲームより前の、点が入ったゲーム（番号順）。上に「第1ゲーム 21-15 ◯◯の勝ち」の札で出す。 */
export function earlierPlayedGames(scores: GameScore[], shownGame: number): GameScore[] {
  return playedGameScores(scores)
    .filter((score) => score.gameNumber < shownGame)
    .sort((a, b) => a.gameNumber - b.gameNumber);
}

/**
 * 点を入れる人のカードに「第N+1ゲームへ進む」を出すとき、その次のゲーム番号。出さないときは null。
 *
 * 出すのは、勝負がついていない間で、いま出しているゲームが最後のゲームより前のとき。
 * 「ゲームが終わった」かどうかは、点からは分からない（何点で終わるかは部によって違う）ので、
 * 自動では切り替えず、押したときだけ切り替える。上限 1 ゲームの試合は、出すゲームが無いので null。
 */
export function nextGameToOffer(
  scores: GameScore[],
  maxGameCount: number,
  shownGame: number
): number | null {
  if (matchOutcome(scores, maxGameCount).finished) return null;
  if (shownGame >= maxGameCount) return null;
  return shownGame + 1;
}
