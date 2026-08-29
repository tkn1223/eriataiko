import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';

export type MatchForFinishing = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
};

/** `finishMatch` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type FinishMatchRepository = {
  findMatch(matchId: string): Promise<MatchForFinishing | null>;
  findGameScores(matchId: string): Promise<GameScore[]>;
  /** `matches` を done にし、finished_at を入れる。 */
  finish(input: { matchId: string; finishedAt: Date }): Promise<void>;
};

export type FinishMatchInput = {
  matchId: string;
  /** テストで時刻を固定できるよう、呼び出し側から渡す。 */
  now: Date;
};

/**
 * 試合を終了する。押し間違いを防ぐため、1 点も入っていない試合は止める。
 * 二重に押されても壊れないよう、既に done なら何もせず成功として扱う。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 */
export async function finishMatch(deps: FinishMatchRepository, input: FinishMatchInput) {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }

  // 電波の悪い体育館では同じ操作が 2 回届く。2 回目でエラーにすると不安にさせる。
  if (match.status === 'done') return;

  const scores = await deps.findGameScores(input.matchId);
  if (!hasAnyPoint(scores)) {
    throw new ApiError(400, 'まだ 1 点も入っていません。得点を入れてから終了してください。');
  }

  await deps.finish({ matchId: input.matchId, finishedAt: input.now });
}
