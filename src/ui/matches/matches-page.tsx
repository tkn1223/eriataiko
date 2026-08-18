'use client';

import { useState } from 'react';
import { CourtCard } from '@/ui/matches/court-card';
import { ScoreSheet } from '@/ui/matches/score-sheet';
import type { Court, CourtMatch, GameScore } from '@/ui/matches/sample-data';

type Props = {
  courts: Court[];
};

type Filter = 'all' | 'mine';

type Selected = {
  courtNumber: number;
  match: CourtMatch;
};

/**
 * 進行表画面。
 *
 * 表示だけを担当する。データの出どころ（DB かダミーか）は知らない。
 * 本物のデータをつなぐときは、渡す props を差し替えるだけでよい。
 *
 * 得点入力の状態（この画面を開いている間だけの得点）はここで持つ。
 * まだ保存する表が無いので、シートを閉じると消える。
 */
export function MatchesPage({ courts }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openCourts, setOpenCourts] = useState<Record<number, boolean>>({});
  const [shownDoneCourts, setShownDoneCourts] = useState<Record<number, boolean>>({});

  const [selected, setSelected] = useState<Selected | null>(null);
  const [sessionGames, setSessionGames] = useState<GameScore[]>([]);
  const [currentGame, setCurrentGame] = useState<GameScore>([0, 0]);

  // 絞り込みは「並べる試合」だけを減らす。見出しの「残り◯試合」「現在◯試合目」は
  // コートの進み具合なので、絞り込んでも全試合から出す（でないと自分の試合が 1 つ終わった
  // だけのコートが「すべて終了」と出てしまう）。
  const visibleCourts = courts
    .map((court) => ({
      court,
      listedMatches:
        filter === 'all' ? court.matches : court.matches.filter((match) => match.isMine),
    }))
    .filter(({ listedMatches }) => filter === 'all' || listedMatches.length > 0);

  function openScoreSheet(courtNumber: number, match: CourtMatch) {
    setSelected({ courtNumber, match });
    setSessionGames([]);
    setCurrentGame(match.currentGame ?? [0, 0]);
  }

  function closeScoreSheet() {
    setSelected(null);
  }

  function increment(side: 'A' | 'B') {
    setCurrentGame(([a, b]) => (side === 'A' ? [a + 1, b] : [a, b + 1]));
  }

  function decrement(side: 'A' | 'B') {
    setCurrentGame(([a, b]) => (side === 'A' ? [Math.max(0, a - 1), b] : [a, Math.max(0, b - 1)]));
  }

  function finishGame() {
    setSessionGames((games) => [...games, currentGame]);
    setCurrentGame([0, 0]);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">進行表</h1>

      <div className="mb-[14px] flex gap-2">
        <FilterPill label="全試合" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterPill
          label="自分の試合"
          active={filter === 'mine'}
          onClick={() => setFilter('mine')}
        />
      </div>

      {visibleCourts.map(({ court, listedMatches }) => (
        <CourtCard
          key={court.courtNumber}
          courtNumber={court.courtNumber}
          allMatches={court.matches}
          listedMatches={listedMatches}
          isOpen={openCourts[court.courtNumber] ?? false}
          showDone={shownDoneCourts[court.courtNumber] ?? false}
          onToggleOpen={() =>
            setOpenCourts((prev) => ({
              ...prev,
              [court.courtNumber]: !prev[court.courtNumber],
            }))
          }
          onToggleShowDone={() =>
            setShownDoneCourts((prev) => ({
              ...prev,
              [court.courtNumber]: !prev[court.courtNumber],
            }))
          }
          onSelectMatch={(match) => openScoreSheet(court.courtNumber, match)}
        />
      ))}

      <ScoreSheet
        match={selected ? { ...selected.match, courtNumber: selected.courtNumber } : null}
        sessionGames={sessionGames}
        currentGame={currentGame}
        onIncrement={increment}
        onDecrement={decrement}
        onFinishGame={finishGame}
        onClose={closeScoreSheet}
      />
    </div>
  );
}

function FilterPill({
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
      className={`inline-flex min-h-11 items-center justify-center rounded-full border px-[18px] text-[14px] font-extrabold ${
        active ? 'bg-ink border-ink text-white' : 'text-ink border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}
