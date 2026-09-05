'use client';

import { BottomSheet } from '@/ui/components/bottom-sheet';

type Props = {
  open: boolean;
  /** 確定しようとしているゲームの番号（第◯ゲーム）。 */
  gameNumber: number;
  teamAName: string;
  teamBName: string;
  /** 確定しようとしているゲームの得点。[A の点, B の点]。 */
  gameScore: [number, number];
  /** このゲームの勝ちペア名。 */
  winnerName: string;
  /** このゲームで試合そのものも終わるか。 */
  matchFinished: boolean;
  /** 試合が終わるときの勝ちペア名。終わらないときは null。 */
  matchWinnerName: string | null;
  /** 試合が終わるときの「2-0」のような表記（勝った側が先）。終わらないときは null。 */
  matchWinnerScoreText: string | null;
  onOk: () => void;
  onClose: () => void;
};

/**
 * 「ゲーム終了」を押したときに出す確認画面。
 *
 * 21 点などの自動終了は無いので、ここが誤タップを防ぐ唯一の歯止めになる
 * （docs/specs/2026-09-04-finish-match.md）。押しどころは大きく、
 * 長いペア名でも途中で切れないようにする（src/ui/me/my-page.tsx と同じ考え方）。
 */
export function FinishConfirmSheet({
  open,
  gameNumber,
  teamAName,
  teamBName,
  gameScore,
  winnerName,
  matchFinished,
  matchWinnerName,
  matchWinnerScoreText,
  onOk,
  onClose,
}: Props) {
  const [scoreA, scoreB] = gameScore;

  return (
    <BottomSheet
      open={open}
      labelledBy="finish-confirm-sheet-title"
      onClose={onClose}
      header={
        <h2 id="finish-confirm-sheet-title" className="text-[16px] font-black">
          {matchFinished ? 'この試合を終了します' : `第${gameNumber}ゲームを終了します`}
        </h2>
      }
    >
      {/* 意味のかたまり（ペア名・得点）ごとに whitespace-nowrap で囲み、
          途中や単語の中で改行されないようにする。折り返しはかたまりの間の空白でだけ起こる。 */}
      <p className="tabular mb-3 text-[15px] font-bold break-words">
        <span className="whitespace-nowrap">{teamAName}</span>{' '}
        <span className="whitespace-nowrap">{`${scoreA} - ${scoreB}`}</span>{' '}
        <span className="whitespace-nowrap">{teamBName}</span>
      </p>

      <p className="mb-1 text-[14px] font-bold break-words text-gray-500">
        このゲームの勝ち: <span className="whitespace-nowrap">{winnerName}</span>
      </p>

      {matchFinished && matchWinnerName && matchWinnerScoreText && (
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
