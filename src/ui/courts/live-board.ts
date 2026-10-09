import type { CourtMatch } from '@/ui/courts/types';

/**
 * 結果LIVE が持つ試合の一覧（`CourtMatch[]`）の置き場。画面の中だけの小さな外部ストア。
 *
 * `useState` の更新関数の中で計算せず、ここに置くのは、
 * - 押したとき・他の人の変化が届いたときに「いまの最新」を同期で読んで次の値を作りたい
 *   （描画を待つと、描き直される前の 2 回目のタップを数えそこねる。e2e/courts.spec.ts の連打の確認）
 * - 届いた変化に「読み直して」の判断が付いてくる。更新関数の中で外に出る処理をしてはいけない
 * ため。画面は `useSyncExternalStore` で読む。
 */
export type LiveBoard = {
  get: () => CourtMatch[];
  /** 同じ一覧（参照が同じ）を渡されたら何もしない。 */
  set: (next: CourtMatch[]) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLiveBoard(initial: CourtMatch[]): LiveBoard {
  let board = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => board,
    set(next) {
      if (next === board) return;
      board = next;
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
