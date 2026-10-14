import { z } from 'zod';
import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { canFinishMatch, endingOfRetiredSide, type MatchEnding } from '@/domain/match-rules';
import { SCORER_ERROR_CODE } from '@/domain/scorer';
import { otherIsScoringError, standingOfPlayer, type MatchScorer } from '@/usecases/match-scorer';

export type MatchForFinishing = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
  /** 同点で終了できないかの判定に要る。matches.max_game_count と同じ意味。 */
  maxGameCount: number;
  /** いまの担当。いなければ null。試合の終了は担当だけが押せる。 */
  scorer: MatchScorer | null;
};

/** `finishMatch` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type FinishMatchRepository = {
  findMatch(matchId: string): Promise<MatchForFinishing | null>;
  findGameScores(matchId: string): Promise<GameScore[]>;
  /** `matches` を done にし、finished_at と ending（普通か棄権か）を入れる。 */
  finish(input: { matchId: string; finishedAt: Date; ending: MatchEnding }): Promise<void>;
};

/**
 * 終了の本文。棄権した側（無ければ普通の終了）。
 * 本文ごと無くてもよい（棄権の無い終了は今までどおり本文なしで送れる）。
 */
export const finishMatchBodySchema = z.object({
  retiredSide: z
    .enum(['A', 'B'], { message: '棄権した側は A か B で指定してください。' })
    .optional(),
});

export type FinishMatchInput = {
  matchId: string;
  /** 棄権した側。無ければ普通の終了。棄権でも点数は必ず入っている（代わりの試合をするため）。 */
  retiredSide?: 'A' | 'B';
  /** 終了を押した人（入場している人の `players.id`）。担当かどうかの確かめに使う。 */
  playerId: string;
  /** テストで時刻を固定できるよう、呼び出し側から渡す。 */
  now: Date;
};

/**
 * 試合を終了する。押し間違いを防ぐため、1 点も入っていない試合・同点の試合は止める。
 * 二重に押されても壊れないよう、既に done なら何もせず成功として扱う。
 *
 * **試合の終了は担当だけ。** ほかの人が終わらせたいときは先に引き継ぐ。担当がいない試合も、
 * 先に担当を取ってもらう（終了は点と違い、送ってきた人を担当にして通すことはしない。
 * 担当が決まらないまま勝敗を確定させないため）。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 *       docs/specs/2026-09-04-finish-match.md（同点の判定）
 *       docs/specs/2026-10-14-match-scorer.md（担当だけ）
 */
export async function finishMatch(deps: FinishMatchRepository, input: FinishMatchInput) {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }

  // 電波の悪い体育館では同じ操作が 2 回届く。2 回目でエラーにすると不安にさせる。
  if (match.status === 'done') return;

  const standing = standingOfPlayer(match.scorer, input.playerId, input.now);
  if (standing === 'other') {
    throw otherIsScoringError(match.scorer!, '終了するには、先に引き継いでください。');
  }
  if (standing === 'vacant') {
    throw new ApiError(
      409,
      'この試合の入力担当ではありません。「得点を入力する」を押してから終了してください。',
      SCORER_ERROR_CODE.notScorer
    );
  }

  const scores = await deps.findGameScores(input.matchId);
  if (!hasAnyPoint(scores)) {
    throw new ApiError(400, 'まだ 1 点も入っていません。得点を入れてから終了してください。');
  }

  // 「同点では終了できない」の判定は画面側とここで共有する（PR #52 レビュー指摘4）。
  // ルールを書く場所を 1 か所にまとめ、ここでは呼ぶだけにする。
  const canFinish = canFinishMatch(scores, match.maxGameCount);
  if (!canFinish.ok) {
    throw new ApiError(400, canFinish.reason);
  }

  await deps.finish({
    matchId: input.matchId,
    finishedAt: input.now,
    ending: endingOfRetiredSide(input.retiredSide),
  });
}
