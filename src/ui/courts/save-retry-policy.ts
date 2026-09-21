/**
 * 得点の保存（`POST /api/matches/[matchId]/scores`）が失敗したときに
 * 「送り直すか・諦めるか」を決める、DB も HTTP も触らない純粋な関数。
 *
 * 送る・送り直す・まとめる仕組み本体は `src/ui/courts/use-score-sync.ts` に置き、
 * 判断だけをここに切り出してテストを速くする（仕様の「つくりの方針」）。
 *
 * 仕様: docs/specs/2026-09-19-save-score-from-courts.md
 */

/** 1 回の送信の結果。fetch 自体が失敗した（オフライン等）ときは 'network'。 */
export type SendResult =
  | { ok: true }
  | { ok: false; kind: 'network' }
  | { ok: false; kind: 'http'; status: number; message: string | null };

/**
 * 送り直すべきか。
 *
 * つながらない（network）・サーバーの一時的な失敗（5xx）・429（一時的な混雑）は送り直す。
 * それ以外の 4xx（400/401/403/404/409 など、入口が断ったもの）は送り直さない
 * （終了済みの試合に何度送っても結果は変わらないため）。
 */
export function shouldRetry(result: Extract<SendResult, { ok: false }>): boolean {
  if (result.kind === 'network') return true;
  return result.status === 429 || result.status >= 500;
}

/** 送り直しの間隔（ミリ秒）。1 秒→2 秒→4 秒→8 秒→最大 10 秒（以降は 10 秒間隔）。 */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 10000] as const;

/** `attempt` は 1 から始まる連続失敗回数。 */
export function retryDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1) - 1, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

/** 応答の本文に日本語の理由が取れなかったときに出す既定の文言。 */
export const DEFAULT_REJECTED_MESSAGE =
  '保存できませんでした。画面を更新してから確認してください。';

/** 送り直さないと決めたときに、そのコートへ出す日本語の理由。 */
export function rejectionMessage(result: Extract<SendResult, { ok: false; kind: 'http' }>): string {
  return result.message ?? DEFAULT_REJECTED_MESSAGE;
}
