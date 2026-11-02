'use client';

import { useState } from 'react';
import { CardDetailSheet } from '@/ui/bracket/card-detail-sheet';
import { KoBracket } from '@/ui/bracket/ko-bracket';
import { LeagueMatrix } from '@/ui/bracket/league-matrix';
import type { KoBracketView, LeagueCard, StandingRow, Team } from '@/ui/bracket/types';
import { StandingsTable } from '@/ui/bracket/standings-table';

type Tab = 'league' | 'tournament';

type Props = {
  teams: Team[];
  leagueCards: LeagueCard[];
  standings: StandingRow[];
  koBracket: KoBracketView;
  /** 読む上限を超えて、星取表や順位が出しきれていないかもしれない。 */
  truncated: boolean;
};

/**
 * 対戦表画面。
 *
 * 表示だけを担当する。データの出どころは知らない
 * （読むのは `src/db/bracket.ts`、画面の形に組むのは `src/usecases/build-bracket-view.ts`）。
 */
export function BracketPage({ teams, leagueCards, standings, koBracket, truncated }: Props) {
  const [tab, setTab] = useState<Tab>('league');
  const [selectedCard, setSelectedCard] = useState<LeagueCard | null>(null);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">対戦表</h1>

      {truncated && (
        <p
          role="alert"
          className="text-live mb-[14px] rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
        >
          試合の数が多すぎて、出しきれていない対戦があるかもしれません。運営の方に知らせてください。
        </p>
      )}

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
        <KoBracketOrNotice view={koBracket} />
      )}

      <CardDetailSheet card={selectedCard} teams={teams} onClose={() => setSelectedCard(null)} />
    </div>
  );
}

/** 勝ち上がり表を出せないときの案内。真っ白のままだと「壊れている？」と思われるため。 */
function KoBracketOrNotice({ view }: { view: KoBracketView }) {
  if (view.kind === 'ready') return <KoBracket data={view.data} />;

  return (
    <p className="mb-5 rounded-2xl border border-gray-200 bg-white p-[14px] text-[14px] font-bold">
      {koNoticeText(view)}
    </p>
  );
}

function koNoticeText(view: Exclude<KoBracketView, { kind: 'ready' }>): string {
  switch (view.kind) {
    case 'not-registered':
      return '決勝トーナメントの組み合わせはまだありません';
    case 'unexpected-shape':
      return `決勝トーナメントの組み合わせが、想定と違う形で登録されています（対戦が ${view.matchupCount} 件）。運営の方に知らせてください。`;
    case 'duplicate-sort-order':
      return '決勝トーナメントの組み合わせが、想定と違う形で登録されています（対戦の並び順が重なっています）。運営の方に知らせてください。';
  }
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
