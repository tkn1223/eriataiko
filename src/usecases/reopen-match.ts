import { ApiError } from '@/server/route-helpers';
import { notParticipantError, type ScorerWriteRepository } from '@/usecases/match-scorer';

export type MatchForReopening = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
};

/** `reopenMatch` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type ReopenMatchRepository = Pick<ScorerWriteRepository, 'findParticipantOfPlayer'> & {
  findMatch(matchId: string): Promise<MatchForReopening | null>;
  /**
   * `matches` を live に戻し、finished_at を空にして、ending（棄権の印）も普通に戻す。
   * 同じ書き込みで、`scorerParticipantId` を担当にして最後に点を入れた時刻を `now` にする
   * （前の担当が誰でも。直している間はほかの人とぶつからないように）。
   */
  reopen(input: { matchId: string; scorerParticipantId: string; now: Date }): Promise<void>;
};

export type ReopenMatchInput = {
  matchId: string;
  /** 「直す」を押した人（入場している人の `players.id`）。その試合の担当になる。 */
  playerId: string;
  /** テストで時刻を固定できるよう、呼び出し側から渡す。 */
  now: Date;
};

/**
 * 終了を取り消す。順位発表後に誤って「終了」を押しても、
 * この道を通らない限り黙って結果が変わらないようにするための出口。
 *
 * `done` でない試合に送っても、何も変えずに成功として扱う
 * （二重に押されても壊れないようにするのと同じ考え方）。
 *
 * **「直す」は誰でも押せて、押した人がその試合の担当になる。** 言われたその場で直せるようにするため、
 * 前の担当への確認は挟まない（終了した試合の担当は、もう点を入れていない）。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 *       docs/specs/2026-10-14-match-scorer.md（⑩）
 */
export async function reopenMatch(deps: ReopenMatchRepository, input: ReopenMatchInput) {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }

  if (match.status !== 'done') return;

  const scorerParticipantId = await deps.findParticipantOfPlayer({
    matchId: input.matchId,
    playerId: input.playerId,
  });
  if (!scorerParticipantId) throw notParticipantError();

  await deps.reopen({ matchId: input.matchId, scorerParticipantId, now: input.now });
}
