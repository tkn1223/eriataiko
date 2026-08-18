'use client';

import type { CardMatch, LeagueCard, Team, TeamNumber } from '@/ui/bracket/sample-data';
import { BottomSheet } from '@/ui/components/bottom-sheet';

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
  if (!card) return null;

  const teamAName = teamName(teams, card.teamA);
  const teamBName = teamName(teams, card.teamB);

  return (
    <BottomSheet
      open
      labelledBy="card-detail-title"
      onClose={onClose}
      header={
        <h2 id="card-detail-title" className="text-[15px] font-black">
          予選リーグ：{teamAName} {scoreTextOf(card)} {teamBName}
        </h2>
      }
    >
      <ul className="flex flex-col gap-2">
        {card.matches.map((match) => (
          <CardMatchRow key={match.id} match={match} />
        ))}
      </ul>
    </BottomSheet>
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
