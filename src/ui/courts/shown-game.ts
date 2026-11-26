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
 * 出すのは、いま出しているゲームが最後のゲームより前のとき（点数は見ない）。
 * 「ゲームが終わった」かどうかは、点からは分からない（何点で終わるかは部によって違う）ので、
 * 自動では切り替えず、押したときだけ切り替える。上限 1 ゲームの試合は、出すゲームが無いので null。
 *
 * 以前は「勝負がついたら出さない」としていたが、今の数え方ではゲームの途中でもリードしている側の勝ちと数えるため、
 * 第1ゲームを取った側が第2ゲームでリードした瞬間に黒い［試合終了］が大きく戻り、押し間違えを招いた。
 * そこで最後のゲームまで「進む」を出し続け、終わらせるのは白い「ここで試合終了」に任せる（2026-11-26 yosuke さん）。
 */
export function nextGameToOffer(
  _scores: GameScore[],
  maxGameCount: number,
  shownGame: number
): number | null {
  if (shownGame >= maxGameCount) return null;
  return shownGame + 1;
}
