'use client';

import { useState } from 'react';
import { CardDetailSheet } from '@/ui/bracket/card-detail-sheet';
import { KoBracket } from '@/ui/bracket/ko-bracket';
import { LeagueMatrix } from '@/ui/bracket/league-matrix';
import type { KoBracketData, LeagueCard, StandingRow, Team } from '@/ui/bracket/sample-data';
import { StandingsTable } from '@/ui/bracket/standings-table';

type Tab = 'league' | 'tournament';

type Props = {
  teams: Team[];
  leagueCards: LeagueCard[];
  standings: StandingRow[];
  koBracket: KoBracketData;
};

/**
 * 対戦表画面。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 本物のデータをつなぐときは、渡す props を差し替えるだけでよい。
 */
export function BracketPage({ teams, leagueCards, standings, koBracket }: Props) {
  const [tab, setTab] = useState<Tab>('league');
  const [selectedCard, setSelectedCard] = useState<LeagueCard | null>(null);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">対戦表</h1>

      <div className="bg-segment mb-5 flex gap-1 rounded-full p-1">
        <TabButton label="予選リーグ" active={tab === 'league'} onClick={() => setTab('league')} />
        <TabButton
          label="決勝トーナメント"
          active={tab === 'tournament'}
          onClick={() => setTab('tournament')}
        />
      </div>

      {tab === 'league' ? (
        <>
          <LeagueMatrix teams={teams} cards={leagueCards} onSelectCard={setSelectedCard} />
          <StandingsTable teams={teams} rows={standings} />
        </>
      ) : (
        <KoBracket data={koBracket} />
      )}

      <CardDetailSheet card={selectedCard} teams={teams} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 flex-1 rounded-full text-[14px] font-extrabold ${
        active ? 'bg-ink text-white' : 'text-ink'
      }`}
    >
      {label}
    </button>
  );
}
