import { playedGameScores, type GameScore } from '@/domain/scoring';

/**
 * カードの真ん中に「第Nゲーム」と出し、点を入れる枠にするゲーム。
 *
 * 試合に「いまのゲーム」という印は持っていない（終わるかどうかは人が「試合を終了する」を押したときだけ。
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
