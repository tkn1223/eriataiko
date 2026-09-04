'use client';

import { useState } from 'react';
import { matchOutcome, winnerOfGame } from '@/domain/match-rules';
import { ClassChip } from '@/ui/components/class-chip';
import { YouTag } from '@/ui/components/you-tag';
import type {
  Court,
  CourtTeam,
  GameScore,
  LiveScore,
  NextMatch,
  TeamNumber,
} from '@/ui/courts/sample-data';
import { FinishConfirmSheet } from '@/ui/courts/finish-confirm-sheet';

type Props = {
  court: Court;
  /** 進行中のコートだけ渡される、ページが持つ得点の状態。 */
  liveScore: LiveScore | null;
  onIncrement: (side: 'A' | 'B') => void;
  onDecrement: (side: 'A' | 'B') => void;
  /** 確認画面で「OK」が押されたときに呼ばれる。実際にゲームを確定する処理はページ側が持つ。 */
  onFinishGame: () => void;
};

/** 得点が入っているか（0対0でないか）。 */
function hasAnyPoint(score: GameScore): boolean {
  return score[0] > 0 || score[1] > 0;
}

/** 「2-0」のような、勝った側を先に書く表記にする。 */
function winnerFirstScoreText(wonGames: [number, number], winner: 'A' | 'B'): string {
  return winner === 'A' ? `${wonGames[0]}-${wonGames[1]}` : `${wonGames[1]}-${wonGames[0]}`;
}

/** チーム番号 → 背景色クラス（globals.css の @theme で定義した --color-team-1〜4）。 */
const TEAM_BG_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/**
 * コート 1 面ぶんのカード。
 *
 * 進行中なら得点をその場で押せる形、空いていれば「呼出待ち」「予定なし」を出す。
 * 得点の状態はここでは持たない（同時に動く複数コートぶんをまとめて courts-page が持つ）。
 */
export function CourtLiveCard({ court, liveScore, onIncrement, onDecrement, onFinishGame }: Props) {
  // 「ゲーム終了」を押したときの確認画面。誤タップの歯止めがこれ 1 つしか無いので、
  // ここで開く・閉じるを持つ（docs/specs/2026-09-04-finish-match.md）。
  const [sheetOpen, setSheetOpen] = useState(false);
  // 0対0・同点で押したときの案内。押し直す（得点を動かす）まで出したままにする。
  const [notice, setNotice] = useState<string | null>(null);

  if (!court.live) {
    return <IdleCourtCard court={court} />;
  }

  const { live, next } = court;
  // 得点が渡ってこなかったときも試合そのものは出す。
  // ここで「予定なし」に化けると、進行中のコートが黙って消えてしまう。
  const { finishedGames, currentGame, finished } = liveScore ?? {
    finishedGames: live.finishedGames,
    currentGame: live.currentGame,
    finished: false,
  };
  const gameNumber = finishedGames.length + 1;
  const [scoreA, scoreB] = currentGame;
  const reachedTwentyOne = scoreA >= 21 || scoreB >= 21;

  const teamAName = live.teamA.players.join('・');
  const teamBName = live.teamB.players.join('・');

  // 終了したコートの「勝ち: ◯◯（2-0）」は、確定済みの finishedGames から求める。
  const finishedOutcome = finished ? matchOutcome(finishedGames, live.maxGameCount) : null;

  // 確認画面に出す内容は、まだ確定していない「今押したら」の想定で組み立てる。
  // 同点のときは handleFinishGameClick が確認画面を開かないので、勝ちペアは必ずどちらかに決まる。
  const pendingWinnerSide = winnerOfGame(currentGame);
  const pendingWinnerName = pendingWinnerSide === 'B' ? teamBName : teamAName;
  const pendingOutcome = matchOutcome([...finishedGames, currentGame], live.maxGameCount);
  const matchWinnerName =
    pendingOutcome.finished && pendingOutcome.winner
      ? pendingOutcome.winner === 'A'
        ? teamAName
        : teamBName
      : null;
  const matchWinnerScoreText =
    pendingOutcome.finished && pendingOutcome.winner
      ? winnerFirstScoreText(pendingOutcome.wonGames, pendingOutcome.winner)
      : null;

  function handleFinishGameClick() {
    if (!hasAnyPoint(currentGame)) {
      setNotice('まだ点が入っていません');
      return;
    }
    if (scoreA === scoreB) {
      setNotice('同点では終了できません');
      return;
    }
    setNotice(null);
    setSheetOpen(true);
  }

  function handleOk() {
    setSheetOpen(false);
    onFinishGame();
  }

  function handleIncrement(side: 'A' | 'B') {
    setNotice(null);
    onIncrement(side);
  }

  function handleDecrement(side: 'A' | 'B') {
    setNotice(null);
    onDecrement(side);
  }

  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className={`flex flex-col gap-[7px] rounded-[14px] border bg-white px-[14px] py-3 ${
        finished ? 'border-gray-200' : 'border-accent'
      } ${live.isMine ? 'ring-accent ring-2' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>
        {finished ? (
          <span className="ml-auto text-[11px] font-extrabold tracking-[0.08em] text-gray-400">
            終了
          </span>
        ) : (
          <span className="text-live ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold tracking-[0.08em]">
            <span aria-hidden="true" className="bg-live animate-blink size-2 rounded-full" />
            LIVE
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ClassChip classLabel={live.classLabel} />
        {/* 終了したコートで「2ゲーム目」と出すと、まだ次のゲームが続くように見えるので回戦だけにする。 */}
        <span className="text-[11px] font-bold whitespace-nowrap text-gray-400">
          {finished ? live.roundLabel : `${live.roundLabel}・${gameNumber}ゲーム目`}
        </span>
        {live.isMine && <YouTag />}
      </div>

      {finished ? (
        <>
          <TeamNameLine team={live.teamA} />
          <TeamNameLine team={live.teamB} />
        </>
      ) : (
        <>
          <TeamRow
            team={live.teamA}
            score={scoreA}
            onIncrement={() => handleIncrement('A')}
            onDecrement={() => handleDecrement('A')}
          />
          <TeamRow
            team={live.teamB}
            score={scoreB}
            onIncrement={() => handleIncrement('B')}
            onDecrement={() => handleDecrement('B')}
          />
        </>
      )}

      {finishedGames.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {finishedGames.map((game, index) => (
            <li
              key={index}
              className="tabular rounded-[6px] bg-gray-100 px-2 py-0.5 text-[11px] font-extrabold text-gray-500"
            >
              {`第${index + 1}ゲーム ${game[0]}-${game[1]}`}
            </li>
          ))}
        </ul>
      )}

      {finished && finishedOutcome?.winner && (
        <p className="text-[13px] font-black break-words">
          勝ち:{' '}
          <span className="whitespace-nowrap">
            {finishedOutcome.winner === 'A' ? teamAName : teamBName}
          </span>
          <span className="tabular whitespace-nowrap">
            {`（${winnerFirstScoreText(finishedOutcome.wonGames, finishedOutcome.winner)}）`}
          </span>
        </p>
      )}

      {!finished && (
        <>
          {notice && (
            <p role="status" className="text-live text-[13px] font-bold">
              {notice}
            </p>
          )}

          <button
            type="button"
            onClick={handleFinishGameClick}
            className={`min-h-11 w-full rounded-[10px] py-[10px] text-[14px] font-bold text-white ${
              reachedTwentyOne ? 'bg-accent' : 'bg-ink'
            }`}
          >
            ゲーム終了
          </button>

          <FinishConfirmSheet
            open={sheetOpen}
            gameNumber={gameNumber}
            teamAName={teamAName}
            teamBName={teamBName}
            gameScore={currentGame}
            winnerName={pendingWinnerName}
            matchFinished={pendingOutcome.finished}
            matchWinnerName={matchWinnerName}
            matchWinnerScoreText={matchWinnerScoreText}
            onOk={handleOk}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}

      {next && <NextRow next={next} />}
    </div>
  );
}

/** 終了したコートで、得点欄を持たずペア名だけ出す行。 */
function TeamNameLine({ team }: { team: CourtTeam }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`size-2.5 shrink-0 rounded-[3px] ${TEAM_BG_CLASS[team.number]}`}
      />
      <span className="min-w-0 text-[14px] font-bold break-words">{team.players.join('・')}</span>
    </span>
  );
}

function TeamRow({
  team,
  score,
  onIncrement,
  onDecrement,
}: {
  team: CourtTeam;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const name = team.players.join('・');

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-[3px] ${TEAM_BG_CLASS[team.number]}`}
        />
        <span className="min-w-0 text-[14px] font-bold break-words">{name}</span>
      </span>

      {/* ＋− は指の腹より大きい 46px 角。得点は桁が増えても位置が動かないよう幅を固定する。 */}
      <span className="grid shrink-0 grid-cols-[46px_46px_auto] items-center gap-1.5">
        <button
          type="button"
          onClick={onDecrement}
          aria-label={`${name}の得点を1減らす`}
          className="flex size-[46px] items-center justify-center rounded-[12px] border border-gray-300 text-[20px] font-bold text-gray-400"
        >
          −
        </button>
        <button
          type="button"
          onClick={onIncrement}
          aria-label={`${name}の得点を1増やす`}
          className="text-ink flex size-[46px] items-center justify-center rounded-[12px] border border-gray-300 text-[20px] font-bold"
        >
          ＋
        </button>
        <span className="tabular text-accent min-w-[60px] text-right text-[36px] font-extrabold">
          {score}
        </span>
      </span>
    </div>
  );
}

function NextRow({ next }: { next: NextMatch }) {
  return (
    <div className="mt-1 border-t border-dashed border-gray-200 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="shrink-0 rounded-[5px] bg-gray-400 px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
          次
        </span>
        <ClassChip classLabel={next.classLabel} />
        <span className={`text-[13px] font-bold ${next.isMine ? 'text-accent' : ''}`}>
          {next.teamA.players.join('・')} vs {next.teamB.players.join('・')}
        </span>
      </div>
    </div>
  );
}

function IdleCourtCard({ court }: { court: Court }) {
  return (
    <div
      data-testid={`court-card-${court.courtNumber}`}
      className="flex flex-col gap-[7px] rounded-[14px] border border-gray-200 bg-white px-[14px] py-3"
    >
      <span className="text-[18px] font-black tracking-[0.04em]">コート{court.courtNumber}</span>

      <p className="py-3 text-center text-[13px] font-bold text-gray-400">
        {court.next ? '呼出待ち' : '予定なし'}
      </p>

      {court.next && <NextRow next={court.next} />}
    </div>
  );
}
