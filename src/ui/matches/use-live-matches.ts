'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { applyLiveChange, type LiveChange } from '@/ui/courts/apply-live-change';
import { createLiveBoard } from '@/ui/courts/live-board';
import {
  createRefreshScheduler,
  REFRESH_MIN_INTERVAL_MS,
  REFRESH_SETTLE_MS,
} from '@/ui/courts/refresh-scheduler';
import { useLiveUpdates, type LiveConnection } from '@/ui/courts/use-live-updates';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 進行表が持つ試合の一覧を、他の人の点や試合の終了に合わせて最新に保つ。
 *
 * **結果LIVE と同じ購読・同じ判断を使い、作り直さない。**
 * - 購読: `useLiveUpdates`（アプリ全体で 1 本。結果LIVE か進行表のどちらかを開いている間だけつなぐ）
 * - 届いた行を一覧に当てる判断: `applyLiveChange`（点が変わるたびに画面全体を読み直さない）
 * - 読み直しをまとめる: `createRefreshScheduler`（間隔も同じ値）
 * ここにあるのは、それらをつなぐ薄い糊だけ。結果LIVE の `courts-page.tsx` と同じ順で組んでいる。
 *
 * 進行表は見るだけなので、結果LIVE にある「手元の点の重ね」（自分で押した点を届いた点より優先する）
 * と「直し中の印」の引き継ぎは要らない。
 *
 * 読み直す（`router.refresh()`）のは次の場面だけ（結果LIVE と同じ）:
 * - つながったとき（開いて最初と、途切れたあと。つながる前の変化は届かないため）
 * - 手元に無い試合の変化が届いたとき（当てる先が無いため）
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */
export function useLiveMatches(serverBoard: BoardMatch[]): {
  board: BoardMatch[];
  connection: LiveConnection;
} {
  const router = useRouter();
  const [liveBoard] = useState(() => createLiveBoard(serverBoard));
  const board = useSyncExternalStore(liveBoard.subscribe, liveBoard.get, liveBoard.get);

  const [refreshScheduler] = useState(() =>
    createRefreshScheduler<LiveChange>({
      refresh: () => router.refresh(),
      settleMs: REFRESH_SETTLE_MS,
      minIntervalMs: REFRESH_MIN_INTERVAL_MS,
    })
  );
  useEffect(() => () => refreshScheduler.cancel(), [refreshScheduler]);

  // 読み直されて新しい一覧が渡されたら置き換える。読み直しを始めてから一覧が届くまでの間に
  // 届いて当てていた変化は、届いた順に当て直す（消えると、終了などが次の変化まで古いまま残る）。
  // 当てる先の無い変化は、届いたときにもう読み直しを頼んであるので、ここでは頼まない。
  const renderedServerBoard = useRef(serverBoard);
  useEffect(() => {
    if (renderedServerBoard.current === serverBoard) return;
    renderedServerBoard.current = serverBoard;
    let reloaded = serverBoard;
    for (const change of refreshScheduler.takeChangesSinceRefresh()) {
      reloaded = applyLiveChange(reloaded, change, {}).board;
    }
    liveBoard.set(reloaded);
  }, [serverBoard, liveBoard, refreshScheduler]);

  const connection = useLiveUpdates({
    onChange: (change) => {
      refreshScheduler.record(change);
      const result = applyLiveChange(liveBoard.get(), change, {});
      liveBoard.set(result.board);
      if (result.needsRefresh) refreshScheduler.request();
    },
    onConnected: () => refreshScheduler.request(),
  });

  return { board, connection };
}
