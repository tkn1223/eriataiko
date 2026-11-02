/**
 * 画面が使う「いま」の時計。画面の中だけの小さな外部ストア（`live-board.ts` と同じ作り）。
 *
 * 5 分で外れる担当を、画面が自分で時間を見て切り替えるために使う。描画の最中に `Date.now()` を読むと、
 * 描き直すたびに値が変わって落ち着かない（React の決まりにも反する）ので、値を持っておき、
 * 決まったとき（一定の間隔・知らせが届いたとき）にだけ `tick` で進める。
 * 画面は `useSyncExternalStore` で読む。
 */
export type Clock = {
  /** 最後に進めた時点の時刻（ミリ秒）。 */
  get: () => number;
  /** 現在の時刻に進める。変わっていれば、見ている人に知らせる。 */
  tick: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createClock(): Clock {
  let now = Date.now();
  const listeners = new Set<() => void>();

  return {
    get: () => now,
    tick() {
      const next = Date.now();
      if (next === now) return;
      now = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
