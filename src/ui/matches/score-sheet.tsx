'use client';

import { BottomSheet } from '@/ui/components/bottom-sheet';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';
import type { CourtMatch, GameScore, MatchTeam, TeamNumber } from '@/ui/matches/sample-data';

type SelectedMatch = CourtMatch & { courtNumber: number };

type Props = {
  match: SelectedMatch | null;
  /** このシートを開いてから「ゲーム終了」で確定したゲーム（保存はされない、その場限り）。 */
  sessionGames: GameScore[];
  /** 進行中のゲームの、今の得点。 */
  currentGame: GameScore;
  onIncrement: (side: 'A' | 'B') => void;
  onDecrement: (side: 'A' | 'B') => void;
  onFinishGame: () => void;
  onClose: () => void;
};

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/**
 * 進行中の試合を押したときに下から出る得点入力シート。
 * 保存先がまだ無いので、ここで入れた点は画面を閉じると消える（注意書きで明示する）。
 * 暗幕・「閉じる」・Esc で閉じる仕組みは BottomSheet に任せる。
 */
export function ScoreSheet({
  match,
  sessionGames,
  currentGame,
  onIncrement,
  onDecrement,
  onFinishGame,
  onClose,
}: Props) {
  if (!match) return null;

  const finishedGames = [...match.finishedGames, ...sessionGames];
  const gameNumber = finishedGames.length + 1;
  const [scoreA, scoreB] = currentGame;
  const reachedTwentyOne = scoreA >= 21 || scoreB >= 21;

  return (
    <BottomSheet
      open
      labelledBy="score-sheet-title"
      onClose={onClose}
      header={
        <>
          <h2 id="score-sheet-title" className="text-[15px] font-black">
            コート{match.courtNumber} ・ [{match.classLabel}] {match.roundLabel}
          </h2>
          <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-extrabold text-gray-500">
            {gameNumber}ゲーム目
          </span>
        </>
      }
    >
      {/* 保存されないことは、得点を押す前に必ず目に入る位置と色で出す。
          リハーサルで「入れたのに消えた」と誤解されるのを防ぐため。 */}
      <UnsavedNotice />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TeamScorePanel
          team={match.teamA}
          score={scoreA}
          onIncrement={() => onIncrement('A')}
          onDecrement={() => onDecrement('A')}
        />
        <TeamScorePanel
          team={match.teamB}
          score={scoreB}
          onIncrement={() => onIncrement('B')}
          onDecrement={() => onDecrement('B')}
        />
      </div>

      {finishedGames.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {finishedGames.map((game, index) => (
            <li
              key={index}
              className="tabular rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-extrabold text-gray-500"
            >
              第{index + 1}ゲーム {game[0]}-{game[1]}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onFinishGame}
        className={`mt-3 min-h-11 w-full rounded-[10px] py-[13px] text-[14px] font-bold text-white ${
          reachedTwentyOne ? 'bg-accent' : 'bg-ink'
        }`}
      >
        ゲーム終了
      </button>
    </BottomSheet>
  );
}

function TeamScorePanel({
  team,
  score,
  onIncrement,
  onDecrement,
}: {
  team: MatchTeam;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[16px] border border-gray-200 bg-gray-50 p-3">
      <p className="flex min-h-[2.6em] items-center justify-center gap-1.5 text-center text-[13px] font-extrabold">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-sm ${TEAM_BG_CLASS[team.number]}`}
        />
        {team.players.join('・')}
      </p>
      <p className="tabular text-[54px] font-extrabold">{score}</p>
      <button
        type="button"
        onClick={onIncrement}
        className="bg-ink min-h-[58px] w-full rounded-[14px] text-[21px] font-extrabold text-white"
      >
        ＋1
      </button>
      <button
        type="button"
        onClick={onDecrement}
        className="min-h-11 w-full rounded-[10px] border border-gray-300 bg-white text-[14px] font-extrabold text-gray-500"
      >
        −1
      </button>
    </div>
  );
}
