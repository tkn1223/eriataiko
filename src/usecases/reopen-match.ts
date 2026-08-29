import { ApiError } from '@/server/route-helpers';

export type MatchForReopening = {
  id: string;
  /** 'waiting' | 'live' | 'done'。 */
  status: string;
};

/** `reopenMatch` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type ReopenMatchRepository = {
  findMatch(matchId: string): Promise<MatchForReopening | null>;
  /** `matches` を live に戻し、finished_at を空にする。 */
  reopen(input: { matchId: string }): Promise<void>;
};

export type ReopenMatchInput = {
  matchId: string;
};

/**
 * 終了を取り消す。順位発表後に誤って「終了」を押しても、
 * この道を通らない限り黙って結果が変わらないようにするための出口。
 *
 * `done` でない試合に送っても、何も変えずに成功として扱う
 * （二重に押されても壊れないようにするのと同じ考え方）。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 */
export async function reopenMatch(deps: ReopenMatchRepository, input: ReopenMatchInput) {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }

  if (match.status !== 'done') return;

  await deps.reopen({ matchId: input.matchId });
}
