'use client';

import { BottomSheet } from '@/ui/components/bottom-sheet';

/** 確認画面に出す 1 ゲームぶんの内訳。 */
export type FinishConfirmGame = {
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
  /** そのゲームの勝ちペア名。同点（実際には起きないが型としては許す）は「引き分け」。 */
  winnerLabel: string;
};

type Props = {
  open: boolean;
  /** 実際にプレーされたゲーム（0 対 0 の枠を除いたもの）だけを渡す。 */
  games: FinishConfirmGame[];
  /** 試合の勝ちペア名。 */
  matchWinnerName: string | null;
  /** 「2-1」のような、勝った側が先の表記。 */
  matchWinnerScoreText: string | null;
  onOk: () => void;
  onClose: () => void;
};

/**
 * 「試合を終了する」を押したときに出す確認画面。
 *
 * 押せるボタンは「試合を終了する」1 つだけになったので、確認する対象も常に試合そのもの
 * （docs/specs/2026-09-04-finish-match.md、PR #52 レビュー指摘1）。
 * 21 点などの自動終了は無いので、ここが誤タップを防ぐ唯一の歯止めになる。
 * 押しどころは大きく、長いペア名でも途中で切れないようにする
 * （src/ui/me/my-page.tsx と同じ考え方）。
 */
export function FinishConfirmSheet({
  open,
  games,
  matchWinnerName,
  matchWinnerScoreText,
  onOk,
  onClose,
}: Props) {
  return (
    <BottomSheet
      open={open}
      labelledBy="finish-confirm-sheet-title"
      onClose={onClose}
      header={
        <h2 id="finish-confirm-sheet-title" className="text-[16px] font-black">
          この試合を終了します
        </h2>
      }
    >
      {/* 意味のかたまり（ゲーム番号・得点・勝ちペア）ごとに whitespace-nowrap で囲み、
          途中や単語の中で改行されないようにする。折り返しはかたまりの間の空白でだけ起こる。 */}
      <ul className="mb-3 flex flex-col gap-1">
        {games.map((game) => (
          <li key={game.gameNumber} className="tabular text-[14px] font-bold break-words">
            <span className="whitespace-nowrap">{`第${game.gameNumber}ゲーム`}</span>{' '}
            <span className="whitespace-nowrap">{`${game.sideAScore} - ${game.sideBScore}`}</span>{' '}
            <span className="whitespace-nowrap text-gray-500">{`勝ち: ${game.winnerLabel}`}</span>
          </li>
        ))}
      </ul>

      {matchWinnerName && matchWinnerScoreText && (
        <p className="mb-1 text-[14px] font-black break-words">
          試合の勝ち: <span className="whitespace-nowrap">{matchWinnerName}</span>
          <span className="tabular whitespace-nowrap">{`（${matchWinnerScoreText}）`}</span>
        </p>
      )}

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
