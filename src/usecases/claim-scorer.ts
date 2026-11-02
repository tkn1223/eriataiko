import { z } from 'zod';
import { ApiError } from '@/server/route-helpers';
import { decideClaim, SCORER_ERROR_CODE } from '@/domain/scorer';
import {
  notParticipantError,
  scorerChangedError,
  scorerSlotOf,
  type MatchScorer,
  type ScorerWriteRepository,
} from '@/usecases/match-scorer';

export type MatchForClaiming = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
  /** いまの担当。いなければ null。 */
  scorer: MatchScorer | null;
};

/** `claimScorer` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type ClaimScorerRepository = Pick<
  ScorerWriteRepository,
  'findParticipantOfPlayer' | 'setScorer'
> & {
  findMatch(matchId: string): Promise<MatchForClaiming | null>;
};

/**
 * 担当を取る本文。`takeOver` は「引き継ぐ」と明示したか（無ければ引き継がない）。
 * 本文ごと無くてもよい（引き継がない取り方は本文なしで送れる）。
 */
export const claimScorerBodySchema = z.object({
  takeOver: z.boolean({ message: 'takeOver は true か false で指定してください。' }).optional(),
});

export type ClaimScorerInput = {
  matchId: string;
  /** 取る人（入場している人の `players.id`）。 */
  playerId: string;
  /** 「引き継ぐ」と明示されたか。ほかの人が担当中（5 分以内）のときだけ意味を持つ。 */
  takeOver: boolean;
  /** テストで時刻を固定できるよう、呼び出し側から渡す。 */
  now: Date;
};

export type ClaimScorerResult = {
  /**
   * - claimed: 空いていた（または 5 分たって外れていた）ので取った
   * - took-over: ほかの人が担当中だったが、引き継ぐと明示されたので取った
   * - already-mine: もう自分が担当だった（時刻を更新しただけ）
   */
  outcome: 'claimed' | 'took-over' | 'already-mine';
  /** 引き継いだときの、前の担当の名前（記録に残す）。それ以外は null。 */
  previousLabel: string | null;
  /** 担当になった参加者の id。 */
  participantId: string;
};

/**
 * 試合の入力担当を取る。
 *
 * 空いている／5 分たった担当は確認なしで取れる。ほかの人が担当中（5 分以内）なら、
 * 「引き継ぐ」と明示されたときだけ取れる（決まりは `src/domain/scorer.ts`）。
 * 呼出待ちの試合でも取れる（最初の 1 点の前に、1 試合に 1 回だけ押す）。終了した試合では取れない
 * （終了を取り消して直すと、押した人が担当になる）。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */
export async function claimScorer(
  deps: ClaimScorerRepository,
  input: ClaimScorerInput
): Promise<ClaimScorerResult> {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }
  if (match.status === 'done') {
    throw new ApiError(409, '終了した試合です。先に「直す」で終了を取り消してください。');
  }

  const decision = decideClaim(
    scorerSlotOf(match.scorer),
    input.playerId,
    input.takeOver,
    input.now
  );

  if (decision === 'refuse') {
    throw new ApiError(
      409,
      `${match.scorer!.label}さんが入力しています。入力するには、引き継いでください。`,
      SCORER_ERROR_CODE.scorerActive
    );
  }

  const participantId =
    decision === 'renew'
      ? match.scorer!.participantId
      : await deps.findParticipantOfPlayer({ matchId: input.matchId, playerId: input.playerId });
  if (!participantId) throw notParticipantError();

  const written = await deps.setScorer({
    matchId: input.matchId,
    participantId,
    expectedHolderParticipantId: match.scorer?.participantId ?? null,
    now: input.now,
  });
  if (!written) throw scorerChangedError();

  if (decision === 'renew') {
    return { outcome: 'already-mine', previousLabel: null, participantId };
  }
  if (decision === 'takeover') {
    return { outcome: 'took-over', previousLabel: match.scorer!.label, participantId };
  }
  return { outcome: 'claimed', previousLabel: null, participantId };
}
