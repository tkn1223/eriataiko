'use client';

import { useState } from 'react';
import type { CourtMatch } from '@/ui/courts/types';

/**
 * 「試合を終了する」「もう一度終了する」の確認画面の開き閉じと、選んだ棄権を、試合ごとにページ側で覚える。
 *
 * 以前は、コートのカードや直し中の枠が自分の中で覚えていた。枠は試合の状態が変わるたびに作り直される
 * （直し中 → 1 つ前 → 直し中）ので、作り直されると開いていた確認画面と選んだ棄権が消えた。
 * また、今の試合の確認画面は「コート」に結びついていたので、開いている間にほかの人がその試合を
 * 終了すると、次の試合の中身に差し替わったまま開いていた（OK で次の試合を終了してしまう）。
 * 試合の id をキーにしてここで覚えれば、枠が作り直されても残り、試合が終われば閉じられる。
 *
 * 仕様: docs/specs/2026-10-14-courts-stale-result.md
 */

type OpenSheets = Record<string, { retiredSide: 'A' | 'B' | null }>;

/** 枠（カード）に渡す、ある試合の確認画面の操作。 */
export type FinishSheetControl = {
  open: boolean;
  /** 確認画面で選んだ棄権の側。選んでいなければ null。 */
  retiredSide: 'A' | 'B' | null;
  /** 開く。棄権は未選択から始める（前の選択を持ち越さない）。 */
  onOpen: () => void;
  onClose: () => void;
  onRetiredSideChange: (side: 'A' | 'B' | null) => void;
};

/**
 * 終わった試合（または一覧に無い試合）の確認画面を閉じる。閉じるものが無ければ同じ参照を返す。
 * 見えなくするだけでなく、覚えている値そのものを消す。残しておくと、その試合が「直す」で
 * 進行中に戻ったとき、前の確認画面が開いた状態で戻ってきてしまう。
 */
export function closeSheetsOfEndedMatches(sheets: OpenSheets, board: CourtMatch[]): OpenSheets {
  const stillOpenIds = Object.keys(sheets).filter((matchId) =>
    board.some((match) => match.matchId === matchId && match.status !== 'done')
  );
  if (stillOpenIds.length === Object.keys(sheets).length) return sheets;
  return Object.fromEntries(stillOpenIds.map((matchId) => [matchId, sheets[matchId]]));
}

/**
 * @param board いまの試合の一覧。渡すと、開いている試合が終わったとき確認画面を閉じる。
 *   null なら閉じない（一覧を持たない場所で、操作だけ使いたいとき）。
 */
export function useFinishSheets(board: CourtMatch[] | null) {
  const [openSheets, setOpenSheets] = useState<OpenSheets>({});

  // 開いている試合が終わったら、描き直しの前に閉じる（次の試合の中身で一瞬でも開かない）。
  // 描画の中で自分の状態を直すのは、React が勧める「前の値から導く」書き方
  const stillOpen = board ? closeSheetsOfEndedMatches(openSheets, board) : openSheets;
  if (stillOpen !== openSheets) setOpenSheets(stillOpen);

  function finishSheetOf(matchId: string): FinishSheetControl {
    const sheet = stillOpen[matchId];
    return {
      open: sheet !== undefined,
      retiredSide: sheet?.retiredSide ?? null,
      onOpen: () =>
        setOpenSheets((previous) => ({ ...previous, [matchId]: { retiredSide: null } })),
      onClose: () =>
        setOpenSheets((previous) => {
          const rest = { ...previous };
          delete rest[matchId];
          return rest;
        }),
      onRetiredSideChange: (retiredSide) =>
        setOpenSheets((previous) =>
          previous[matchId] ? { ...previous, [matchId]: { retiredSide } } : previous
        ),
    };
  }

  return { finishSheetOf };
}
