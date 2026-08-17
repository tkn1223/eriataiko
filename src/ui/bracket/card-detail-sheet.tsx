'use client';

import { useEffect } from 'react';
import type { CardMatch, LeagueCard, Team, TeamNumber } from '@/ui/bracket/sample-data';

type Props = {
  card: LeagueCard | null;
  teams: Team[];
  onClose: () => void;
};

const CLASS_TEXT_CLASS: Record<CardMatch['classLabel'], string> = {
  '1部': 'text-class-1',
  '2部': 'text-class-2',
  '3部': 'text-class-3',
};

const CLASS_BG_CLASS: Record<CardMatch['classLabel'], string> = {
  '1部': 'bg-class-1-bg',
  '2部': 'bg-class-2-bg',
  '3部': 'bg-class-3-bg',
};

function teamName(teams: Team[], teamNumber: TeamNumber) {
  return teams.find((team) => team.number === teamNumber)?.name ?? '';
}

/**
 * 見出しの真ん中に出す文字。
 * まだやっていない対戦を「0-0」と書くと「0 対 0 で終わった」と読めてしまうので「vs」にする。
 */
function scoreTextOf(card: LeagueCard) {
  if (card.gamesWonA === undefined || card.gamesWonB === undefined) return 'vs';
  return `${card.gamesWonA}-${card.gamesWonB}`;
}

/**
 * 星取表のマスを押したときに下から出る詳細シート。
 * 背景の暗い部分・「閉じる」・Esc のどれでも閉じる。
 */
export function CardDetailSheet({ card, teams, onClose }: Props) {
  const open = card !== null;

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!card) return null;

  const teamAName = teamName(teams, card.teamA);
  const teamBName = teamName(teams, card.teamB);

  return (
    // touch-none: 暗い部分をなぞってもページを動かさない。Chromium では動かないことを
    // 実測できたが、iOS Safari では背後が動く作りなので、指の操作そのものを受け付けない。
    // （背後の縦スクロールは body ではなく Konsta の Page が持つので、body を止めても効かない）
    <div className="fixed inset-0 z-30 flex touch-none items-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="背景"
        className="bg-ink/45 absolute inset-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-detail-title"
        // シートの中身が長いときはここだけ縦に動かす（overscroll-contain で背後には伝えない）。
        // 下の余白は、iPhone のホームバーに最後の行が隠れないぶんを足す。
        className="relative z-10 max-h-[78vh] w-full touch-pan-y overflow-y-auto overscroll-contain rounded-t-[20px] bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="card-detail-title" className="text-[15px] font-black">
            予選リーグ：{teamAName} {scoreTextOf(card)} {teamBName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 px-3 text-sm font-bold"
          >
            閉じる ✕
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {card.matches.map((match) => (
            <CardMatchRow key={match.id} match={match} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CardMatchRow({ match }: { match: CardMatch }) {
  const aWins =
    match.status === 'done' && match.scoreA !== undefined && match.scoreB !== undefined
      ? match.scoreA > match.scoreB
      : false;
  const bWins =
    match.status === 'done' && match.scoreA !== undefined && match.scoreB !== undefined
      ? match.scoreB > match.scoreA
      : false;

  return (
    <li
      data-testid={`card-match-${match.id}`}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
        match.status === 'live' ? 'bg-accent-soft' : ''
      }`}
    >
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${CLASS_TEXT_CLASS[match.classLabel]} ${CLASS_BG_CLASS[match.classLabel]}`}
      >
        {match.classLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[14px] font-bold ${aWins ? 'font-black' : bWins ? 'text-gray-500' : ''}`}
        >
          {match.teamAPlayers.join('・')}
        </p>
        <p
          className={`truncate text-[14px] font-bold ${bWins ? 'font-black' : aWins ? 'text-gray-500' : ''}`}
        >
          {match.teamBPlayers.join('・')}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {match.status !== 'waiting' && match.scoreA !== undefined && match.scoreB !== undefined ? (
          <p className="tabular text-accent text-[12px] font-extrabold">
            {match.scoreA}-{match.scoreB}
          </p>
        ) : (
          <p className="text-[11px] font-bold text-gray-400">未</p>
        )}
        {match.status === 'live' && <p className="text-live text-[10px] font-extrabold">LIVE</p>}
      </div>
    </li>
  );
}
