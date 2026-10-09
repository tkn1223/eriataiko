/**
 * 「画面を読み直して」という依頼をまとめて、読み直しが連続しないようにする。
 * あわせて、読み直しの間に届いた変化を覚えておき、読み直した一覧に当て直せるようにする。
 *
 * **まとめる**: 手元に無い試合の変化は、届くたびに読み直すと、変化が続いたとき（決勝の組み合わせが
 * 決まって一度に何試合も動いたときなど）に読み直しが何回も走る。見ている全員が同時にやると
 * 通信量の枠を食い潰すので、
 * - 依頼が来たら `settleMs` だけ待って、その間に来た依頼を 1 回にまとめる
 * - 前回の読み直しから `minIntervalMs` が空くまでは次をしない
 * の 2 つで止める。
 *
 * **当て直す**: 読み直した一覧は、サーバーが読んだ時点の様子。読み直しを始めてから一覧が届くまでの
 * 間にも変化は届き、画面に当たっている。届いた一覧でそのまま置き換えると、その変化が消え、
 * 試合の終了などは次の変化まで古いまま残る。そこで、読み直しを始めてから届いた変化を覚えておき
 * （`record`）、一覧が届いたら取り出して（`takeChangesSinceRefresh`）届いた順に当て直す。
 * サーバーが読む前に起きた変化を当て直しても、購読の知らせは書いた順に届くので、最後は新しい値になる。
 */

type Options = {
  refresh: () => void;
  /** 最初の依頼から、まとめて読み直すまで待つ時間。 */
  settleMs: number;
  /** 読み直しと読み直しの最小の間隔。 */
  minIntervalMs: number;
};

export type RefreshScheduler<Change> = {
  request: () => void;
  /** 待っている読み直しを取りやめる（画面を離れるとき）。 */
  cancel: () => void;
  /** 届いた変化を知らせる。読み直しの最中（始めてから一覧が届くまで）だけ覚えておく。 */
  record: (change: Change) => void;
  /** 読み直した一覧が届いた。読み直しを始めてから届いた変化を、届いた順に返して忘れる。 */
  takeChangesSinceRefresh: () => Change[];
};

/**
 * 読み直しの最中に覚えておく変化の上限。読み直しは普通 1 秒ほどで終わり、その間に届く変化は数件。
 * 読み直しの返事が来ないまま（電波が切れたなど）変化を覚え続けないための歯止め。
 */
const MAX_RECORDED_CHANGES = 500;

export function createRefreshScheduler<Change>({
  refresh,
  settleMs,
  minIntervalMs,
}: Options): RefreshScheduler<Change> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshAt: number | null = null;
  /** 読み直しの最中に届いた変化。読み直していないときは null（覚えない）。 */
  let recorded: Change[] | null = null;

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
        // 前の読み直しの一覧がまだ届いていなければ、覚えている分はそのまま続けて覚える
        recorded ??= [];
        refresh();
      }, delay);
    },

    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      recorded = null;
    },

    record(change) {
      if (!recorded) return;
      recorded.push(change);
      // 上限を超えたら古いほうから捨てる（同じ行のもっと新しい変化が後ろに残る）
      if (recorded.length > MAX_RECORDED_CHANGES) recorded.shift();
    },

    takeChangesSinceRefresh() {
      const changes = recorded ?? [];
      recorded = null;
      return changes;
    },
  };
}
