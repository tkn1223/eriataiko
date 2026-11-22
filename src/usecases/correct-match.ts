import { z } from 'zod';
import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { canFinishMatch, endingOfRetiredSide, type MatchEnding } from '@/domain/match-rules';

export type MatchForCorrecting = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
  maxGameCount: number;
};

/** `correctMatch` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type CorrectMatchRepository = {
  findMatch(matchId: string): Promise<MatchForCorrecting | null>;
  /**
   * 棄権の印（ending）を、**まだ done のときだけ**書き、続けて全ゲームの点をまとめて上書きする。
   * done でなくなっていて印が書けなかったら、点も書かずに false を返す。
   * 状態・終了時刻・入力担当は触らない。
   */
  writeCorrection(input: {
    matchId: string;
    scores: GameScore[];
    ending: MatchEnding;
    now: Date;
  }): Promise<boolean>;
};

const scoreSchema = z.object({
  gameNumber: z.number().int().min(1, { message: 'ゲーム番号は 1 以上にしてください。' }),
  sideAScore: z.number().int().min(0, { message: '得点は 0 以上にしてください。' }),
  sideBScore: z.number().int().min(0, { message: '得点は 0 以上にしてください。' }),
});

/** 訂正の本文。全ゲームの点と、棄権した側（無ければ null）。 */
export const correctMatchBodySchema = z.object({
  scores: z.array(scoreSchema).max(50, { message: 'ゲームの数が多すぎます。' }),
  retiredSide: z
    .enum(['A', 'B'], { message: '棄権した側は A か B で指定してください。' })
    .nullable(),
});

export type CorrectMatchInput = {
  matchId: string;
  scores: GameScore[];
  retiredSide: 'A' | 'B' | null;
  /** テストで時刻を固定できるよう、呼び出し側から渡す。 */
  now: Date;
};

const STILL_PLAYING_MESSAGE =
  'この試合はまだ終わっていません。試合中の点は試合速報で直してください。';

/**
 * 終わった試合の点と棄権を、終わったまま書き換える（進行表の「得点を訂正する」）。
 *
 * 試合速報の「1つ前［訂正］」（試合中に戻す）とは別のやり方。状態・終了時刻・担当は触らない。
 * 同じ内容を送り直せば必ず同じ結果になる（全ゲームを上書きするだけ）ので、途中で切れても押し直せばよい。
 * 「終わった試合の直接の訂正はしない」という 2026-08-29 の決定を、この機能に限って覆している。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export async function correctMatch(deps: CorrectMatchRepository, input: CorrectMatchInput) {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }
  if (match.status !== 'done') {
    throw new ApiError(409, STILL_PLAYING_MESSAGE);
  }

  const seen = new Set<number>();
  for (const { gameNumber } of input.scores) {
    if (gameNumber < 1 || gameNumber > match.maxGameCount) {
      throw new ApiError(
        400,
        `この試合は第 ${match.maxGameCount} ゲームまでです。画面を更新してからやり直してください。`
      );
    }
    if (seen.has(gameNumber)) {
      throw new ApiError(
        400,
        '同じゲームの点が重なっています。画面を更新してからやり直してください。'
      );
    }
    seen.add(gameNumber);
  }

  if (!hasAnyPoint(input.scores)) {
    throw new ApiError(400, '1 点も入っていません。点を入れてから訂正してください。');
  }
  // 終了と同じ判定を共有する（同点では勝敗が決まらず、順位が崩れるため）
  const canFinish = canFinishMatch(input.scores, match.maxGameCount);
  if (!canFinish.ok) {
    throw new ApiError(400, canFinish.reason);
  }

  const written = await deps.writeCorrection({
    matchId: input.matchId,
    scores: input.scores,
    ending: endingOfRetiredSide(input.retiredSide),
    now: input.now,
  });
  if (!written) {
    // 読んだあとに、試合速報で「訂正」されて試合中に戻った
    throw new ApiError(409, STILL_PLAYING_MESSAGE);
  }
}
