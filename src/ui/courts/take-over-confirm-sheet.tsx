'use client';

import { BottomSheet } from '@/ui/components/bottom-sheet';

type Props = {
  open: boolean;
  /** いまの担当の名前（「愛知北のじろう」。チーム名つき。「さん」はここで付ける）。 */
  scorerName: string;
  onOk: () => void;
  onClose: () => void;
};

/**
 * 「引き継ぐ」を押したときに出す確認画面。
 *
 * ほかの人が入力している試合を引き継ぐと、その人の ＋ − は断られる。気づかずに引き継ぐと
 * 入力中の人の邪魔になるので、誰が入れているかを見せてから聞く。
 * 作りは終了の取り消しの確認画面（reopen-confirm-sheet.tsx）と揃えてある。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */
export function TakeOverConfirmSheet({ open, scorerName, onOk, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      labelledBy="take-over-confirm-sheet-title"
      onClose={onClose}
      header={
        <h2 id="take-over-confirm-sheet-title" className="text-[16px] font-black">
          入力を引き継ぎます
        </h2>
      }
    >
      <p className="mb-2 text-[14px] font-bold break-words">
        {`${scorerName}さんが入れています。引き継ぎますか？`}
      </p>

      <p className="text-[13px] text-gray-500">
        引き継ぐと、{scorerName}さんの ＋ − は断られます。取り戻したいときは、もう一度引き継げます。
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
