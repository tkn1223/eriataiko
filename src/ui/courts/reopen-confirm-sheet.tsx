'use client';

import type { FinishConfirmGame } from '@/ui/courts/finish-confirm-sheet';
import { BottomSheet } from '@/ui/components/bottom-sheet';

type Props = {
  open: boolean;
  /** 終わった試合のゲームごとの得点（0 対 0 の枠を除いたもの）。 */
  games: FinishConfirmGame[];
  teamAName: string;
  teamBName: string;
  onOk: () => void;
  onClose: () => void;
};

/**
 * 「直す」を押したときに出す確認画面。
 *
 * 終了を取り消すと、その試合は「直し中」に戻り、順位や勝ち上がりの元になる結果もいったん無くなる。
 * 押し間違いの歯止めはここ 1 つなので、どの試合を直すのか（ペア名・得点）を見せてから聞く。
 * 作りは終了の確認画面（finish-confirm-sheet.tsx）と揃えてある。
 */
export function ReopenConfirmSheet({ open, games, teamAName, teamBName, onOk, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      labelledBy="reopen-confirm-sheet-title"
      onClose={onClose}
      header={
        <h2 id="reopen-confirm-sheet-title" className="text-[16px] font-black">
          この試合を直します
        </h2>
      }
    >
      <p className="mb-2 text-[14px] font-bold break-words">
        <span className="whitespace-nowrap">{teamAName}</span>
        {' vs '}
        <span className="whitespace-nowrap">{teamBName}</span>
      </p>

      <ul className="mb-3 flex flex-col gap-1">
        {games.map((game) => (
          <li key={game.gameNumber} className="tabular text-[14px] font-bold">
            <span className="whitespace-nowrap">{`第${game.gameNumber}ゲーム`}</span>{' '}
            <span className="whitespace-nowrap">{`${game.sideAScore} - ${game.sideBScore}`}</span>
          </li>
        ))}
      </ul>

      <p className="text-[13px] text-gray-500">
        終了をいったん取り消して、点を直せる状態に戻します。直したら「もう一度終了する」を押してください。
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-[10px] border border-gray-300 py-[10px] text-[14px] font-bold"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onOk}
          className="bg-ink min-h-11 rounded-[10px] py-[10px] text-[14px] font-bold text-white"
        >
          OK
        </button>
      </div>
    </BottomSheet>
  );
}
