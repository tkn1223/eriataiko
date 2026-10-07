/**
 * 試合が終わったかどうかの判定。DB も画面も触らない。
 *
 * 経緯: docs/specs/2026-09-04-finish-match.md
 *
 * 21 点などの点数では自動終了しない（部によって何点先取かが違うため）。
 * 終わるかどうかは「ゲームを何本先取したか」だけで決まる。
 *
 * ゲーム 1 つぶんの得点は独自の型を持たず、src/domain/scoring.ts の GameScore
 * （{ gameNumber, sideAScore, sideBScore }）をそのまま使う。
 * 型が 2 つあると、どちらに合わせて直せばいいか分からなくなる（PR #52 レビュー指摘2）。
 */

import { playedGameScores, type GameScore } from '@/domain/scoring';

export type { GameScore };

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
  if (score.sideAScore > score.sideBScore) return 'A';
  if (score.sideBScore > score.sideAScore) return 'B';
  return null;
}

/**
 * 勝ちゲーム数が多いほうの側を返す。同数（同点）は null。
 *
 * 「試合終了の条件を満たしたか」とは別の判断。終了は人が押したときだけなので、
 * 上限ゲーム数を消化していなくても（決勝で 1-0 のまま終了するなど）勝ちペアは決まる。
 * 「同点かどうか」の判断もここに寄せ、canFinishMatch と表示で同じ物差しを使う。
 */
export function leadingSide(wonGames: [number, number]): 'A' | 'B' | null {
  if (wonGames[0] > wonGames[1]) return 'A';
  if (wonGames[1] > wonGames[0]) return 'B';
  return null;
}

/**
 * ゲームの一覧から、試合が終了したか・どちらが勝ったかを返す。
 *
 * 渡す配列は「上限ゲーム数ぶんの枠」をそのまま渡してよい（0 対 0 の枠が混ざっていてもよい）。
 * playedGameScores で 0 対 0 の枠を除いてから数える（自前で除く処理は書かない。
 * scoring.ts と「空のゲームは数えない」の扱いをそろえるため。PR #52 レビュー指摘2）。
 *
 * - どちらかが gamesToWin に達したら、その時点で試合終了
 * - プレーされたゲームが上限ゲーム数ぶん消化したら、勝ちゲーム数が多いほうの勝ちで試合終了
 *   （同数なら winner は null。バドミントンでは実際には起きないが、型としては許す）
 */
export function matchOutcome(scores: GameScore[], maxGameCount: number): MatchOutcome {
  const needed = gamesToWin(maxGameCount);
  const playedGames = playedGameScores(scores);

  let wonByA = 0;
  let wonByB = 0;
  for (const game of playedGames) {
    const winner = winnerOfGame(game);
    if (winner === 'A') wonByA += 1;
    if (winner === 'B') wonByB += 1;
  }
  const wonGames: [number, number] = [wonByA, wonByB];

  if (wonByA >= needed) return { finished: true, winner: 'A', wonGames };
  if (wonByB >= needed) return { finished: true, winner: 'B', wonGames };

  if (playedGames.length >= maxGameCount) {
    return { finished: true, winner: leadingSide(wonGames), wonGames };
  }

  return { finished: false, winner: null, wonGames };
}

/** `canFinishMatch` の返り値。理由は画面にそのまま出せる日本語。 */
export type CanFinishMatchResult = { ok: true } | { ok: false; reason: string };

/**
 * 試合を「終了する」操作をしてよいかを判定する。
 *
 * ここで見るのは「勝ちゲーム数が同数（同点）で終了できない」の 1 点だけ。
 * 「1 点も入っていない」は scoring.ts の hasAnyPoint が持つ別の理由の判定なので、
 * ここには混ぜない（呼び出し側で先に hasAnyPoint を見てから、こちらを見る）。
 *
 * 人間が決めた方針: 同点（勝ちゲーム数が同数）では試合を終了できない。
 * バドミントンに引き分けは無く、勝者が決まらないと順位の計算が崩れるため。
 *
 * usecases/finish-match.ts（保存の入口）と画面の両方がこの関数を呼ぶ。
 * ルールが 1 か所にまとまっていることは match-rules.test.ts / finish-match.test.ts で確かめる
 * （PR #52 レビュー指摘4）。
 */
export function canFinishMatch(scores: GameScore[], maxGameCount: number): CanFinishMatchResult {
  const { wonGames } = matchOutcome(scores, maxGameCount);
  if (leadingSide(wonGames) === null) {
    return { ok: false, reason: '同点では終了できません' };
  }
  return { ok: true };
}
