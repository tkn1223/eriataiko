/**
 * 「画面を読み直して」という依頼をまとめて、読み直しが連続しないようにする。
 *
 * 手元に無い試合の変化は、届くたびに読み直すと、変化が続いたとき（決勝の組み合わせが
 * 決まって一度に何試合も動いたときなど）に読み直しが何回も走る。見ている全員が同時にやると
 * 通信量の枠を食い潰すので、
 * - 依頼が来たら `settleMs` だけ待って、その間に来た依頼を 1 回にまとめる
 * - 前回の読み直しから `minIntervalMs` が空くまでは次をしない
 * の 2 つで止める。
 */

type Options = {
  refresh: () => void;
  /** 最初の依頼から、まとめて読み直すまで待つ時間。 */
  settleMs: number;
  /** 読み直しと読み直しの最小の間隔。 */
  minIntervalMs: number;
};

export type RefreshScheduler = {
  request: () => void;
  /** 待っている読み直しを取りやめる（画面を離れるとき）。 */
  cancel: () => void;
};

export function createRefreshScheduler({
  refresh,
  settleMs,
  minIntervalMs,
}: Options): RefreshScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshAt: number | null = null;

  return {
    request() {
      // もう読み直しの予定があれば、その予定に乗る（依頼を増やさない）
      if (timer) return;

      const now = Date.now();
      const earliest = lastRefreshAt === null ? now : lastRefreshAt + minIntervalMs;
      const delay = Math.max(settleMs, earliest - now);

      timer = setTimeout(() => {
        timer = null;
        lastRefreshAt = Date.now();
        refresh();
      }, delay);
    },

    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
