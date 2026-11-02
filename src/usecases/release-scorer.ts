import { ApiError } from '@/server/route-helpers';
import {
  otherIsScoringError,
  scorerChangedError,
  standingOfPlayer,
  type MatchScorer,
  type ScorerWriteRepository,
} from '@/usecases/match-scorer';

export type MatchForReleasing = {
  id: string;
  /** いまの担当。いなければ null。 */
  scorer: MatchScorer | null;
};

/** `releaseScorer` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type ReleaseScorerRepository = Pick<ScorerWriteRepository, 'clearScorer'> & {
  findMatch(matchId: string): Promise<MatchForReleasing | null>;
};

export type ReleaseScorerInput = {
  matchId: string;
  /** やめる人（入場している人の `players.id`）。 */
  playerId: string;
  now: Date;
};

export type ReleaseScorerResult = {
  /** released: 担当が外れた。already-vacant: もう誰も担当ではなかった（何も書いていない）。 */
  outcome: 'released' | 'already-vacant';
};

/**
 * 試合の入力担当をやめる（「入力をやめる」）。**自分が担当のときだけ**やめられる。
 *
 * ほかの人が担当中（5 分以内）なら断る（ほかの人の担当を外さない）。誰も担当でなければ、何も書かずに
 * 成功として扱う（二重に押されても、電波で返事が失われて押し直されても壊れない）。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */
export async function releaseScorer(
  deps: ReleaseScorerRepository,
  input: ReleaseScorerInput
): Promise<ReleaseScorerResult> {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }

  const standing = standingOfPlayer(match.scorer, input.playerId, input.now);
  if (standing === 'other') {
    throw otherIsScoringError(match.scorer!, 'あなたは担当ではないので、やめられません。');
  }
  if (standing === 'vacant') return { outcome: 'already-vacant' };

  const cleared = await deps.clearScorer({
    matchId: input.matchId,
    expectedHolderParticipantId: match.scorer!.participantId,
  });
  if (!cleared) throw scorerChangedError();
  return { outcome: 'released' };
}
