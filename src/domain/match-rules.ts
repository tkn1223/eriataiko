/**
 * 試合が終わったかどうかの判定。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-04-finish-match.md
 *
 * 21 点などの点数では自動終了しない（部によって何点先取かが違うため）。
 * 終わるかどうかは「ゲームを何本先取したか」だけで決まる。
 */

/** 1 ゲームの得点。[ペアA の点, ペアB の点]。 */
export type GameScore = [number, number];

/** 試合の判定結果。wonGames は [A の勝ちゲーム数, B の勝ちゲーム数]。 */
export type MatchOutcome = {
  finished: boolean;
  winner: 'A' | 'B' | null;
  wonGames: [number, number];
};

/**
 * 上限ゲーム数から、勝つのに必要なゲーム数を返す（上限の半分を切り上げ）。
 * 上限 1 → 1、上限 3 → 2、上限 5 → 3。
 */
export function gamesToWin(maxGameCount: number): number {
  // 0 以下を通すと「1 ゲームも終わっていないのに試合終了・勝者 A」という結果を黙って返してしまう。
  // matches.max_game_count は DB 側でも > 0 に制限しているので、ここに来たら渡し方の間違い。
  if (!Number.isInteger(maxGameCount) || maxGameCount < 1) {
    throw new Error(`上限ゲーム数は 1 以上の整数にしてください: ${maxGameCount}`);
  }
  return Math.ceil(maxGameCount / 2);
}

/** 1 ゲームの得点から、そのゲームの勝者を返す。同点は null。 */
export function winnerOfGame(score: GameScore): 'A' | 'B' | null {
  const [scoreA, scoreB] = score;
  if (scoreA > scoreB) return 'A';
  if (scoreB > scoreA) return 'B';
  return null;
}

/**
 * 終わったゲームの一覧から、試合が終了したか・どちらが勝ったかを返す。
 *
 * - どちらかが gamesToWin に達したら、その時点で試合終了
 * - 上限ゲーム数ぶん消化したら、勝ちゲーム数が多いほうの勝ちで試合終了
 *   （同数なら winner は null。バドミントンでは実際には起きないが、型としては許す）
 */
export function matchOutcome(finishedGames: GameScore[], maxGameCount: number): MatchOutcome {
  const needed = gamesToWin(maxGameCount);

  let wonByA = 0;
  let wonByB = 0;
  for (const game of finishedGames) {
    const winner = winnerOfGame(game);
    if (winner === 'A') wonByA += 1;
    if (winner === 'B') wonByB += 1;
  }
  const wonGames: [number, number] = [wonByA, wonByB];

  if (wonByA >= needed) return { finished: true, winner: 'A', wonGames };
  if (wonByB >= needed) return { finished: true, winner: 'B', wonGames };

  if (finishedGames.length >= maxGameCount) {
    const winner = wonByA > wonByB ? 'A' : wonByB > wonByA ? 'B' : null;
    return { finished: true, winner, wonGames };
  }

  return { finished: false, winner: null, wonGames };
}
