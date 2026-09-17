import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { canFinishMatch } from '@/domain/match-rules';

export type MatchForFinishing = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
  /** 同点で終了できないかの判定に要る。matches.max_game_count と同じ意味。 */
  maxGameCount: number;
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
 * 試合を終了する。押し間違いを防ぐため、1 点も入っていない試合・同点の試合は止める。
 * 二重に押されても壊れないよう、既に done なら何もせず成功として扱う。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 *       docs/specs/2026-09-04-finish-match.md（同点の判定）
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

  // 「同点では終了できない」の判定は画面側とここで共有する（PR #52 レビュー指摘4）。
  // ルールを書く場所を 1 か所にまとめ、ここでは呼ぶだけにする。
  const canFinish = canFinishMatch(scores, match.maxGameCount);
  if (!canFinish.ok) {
    throw new ApiError(400, canFinish.reason);
  }

  await deps.finish({ matchId: input.matchId, finishedAt: input.now });
}
