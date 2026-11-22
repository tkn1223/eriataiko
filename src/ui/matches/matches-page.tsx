'use client';

import { useEffect, useMemo, useState } from 'react';
import { LiveDownNotice } from '@/ui/components/live-down-notice';
import { CourtCard } from '@/ui/matches/court-card';
import { CourtChipStrip } from '@/ui/matches/court-chips';
import { CourtMatches } from '@/ui/matches/court-matches';
import { summarizeCourt } from '@/ui/matches/court-summary';
import { deriveMatchesCourts } from '@/ui/matches/derive-matches-courts';
import { MatchRow } from '@/ui/matches/match-row';
import { MatchesSubtitle } from '@/ui/matches/matches-subtitle';
import { SearchResults } from '@/ui/matches/search-results';
import { useLiveMatches } from '@/ui/matches/use-live-matches';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  /**
   * 試合の一覧（読み込んだ時点の様子）。コートのカードはここから組み立てる。
   * 読み直されて新しい一覧が渡されたら、画面が持っている様子を置き換える。
   */
  board: BoardMatch[];
  /** 読む上限を超えて、試合が出しきれていないかもしれない。 */
  truncated: boolean;
  /** URL の `?court=N`（1b を最初から開く）。無ければ null。 */
  initialCourt: number | null;
  /** 帯の小見出し「進行表 ・ 予選リーグ 27/72 試合」の元。 */
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
};

const COURT_PARAM = 'court';

function courtFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get(COURT_PARAM);
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * 進行表画面。1a 全コート・1b コートの全試合・1c 探す を、この 1 枚で切り替える。
 * 「点を入れる」のは今も試合速報だけで、進行表からは「終わった試合を直す」だけ
 * （詳しい画面から。docs/specs/2026-11-22-matches-redesign.md）。
 *
 * 1a と 1b の切り替えは URL（`?court=N`）に出すが、**画面は読み直さない**
 * （`history.pushState`。切り替えのたびに全試合を読むと、通信量の枠を食い潰す）。
 * 戻るボタンで戻れるよう、`popstate` で状態を合わせる。
 *
 * 渡す props は `page.tsx` が DB から組み立てる（`src/usecases/build-matches-view.ts`）。
 * 他の人の点や試合の終了は `use-live-matches.ts` が試合速報と同じ購読で受け取り、届いた行だけを
 * 一覧に当てる（点が変わるたびに画面全体を読み直さない）。
 */
export function MatchesPage({
  board: serverBoard,
  truncated,
  initialCourt,
  stageLabel,
  completedMatches,
  totalMatches,
}: Props) {
  const { board, connection } = useLiveMatches(serverBoard);
  const [openCourt, setOpenCourt] = useState<number | null>(initialCourt);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const syncFromLocation = () => setOpenCourt(courtFromSearch(window.location.search));
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const courts = useMemo(() => deriveMatchesCourts(board), [board]);
  const numberedCourts = courts.filter((court) => court.courtNumber !== null);
  const undecidedCourt = courts.find((court) => court.courtNumber === null);
  const chips = numberedCourts.map((court) => ({
    courtNumber: court.courtNumber as number,
    status: summarizeCourt(court.matches).status,
  }));

  // 存在しないコート番号（URL を書き換えた・コートが無くなった）は全コートの画面にする
  const openedCourt = numberedCourts.find((court) => court.courtNumber === openCourt) ?? null;

  function showCourt(courtNumber: number | null) {
    setOpenCourt(courtNumber);
    const url = courtNumber === null ? window.location.pathname : `?${COURT_PARAM}=${courtNumber}`;
    window.history.pushState(null, '', url);
    window.scrollTo?.({ top: 0 });
  }

  function scrollToCourt(courtNumber: number) {
    document.getElementById(`matches-court-${courtNumber}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function stopSearching() {
    setQuery('');
    setSearching(false);
  }

  const searchActive = searching || query !== '';

  return (
    <div className="mx-auto max-w-md px-3 pb-4">
      <MatchesSubtitle
        stageLabel={stageLabel}
        completedMatches={completedMatches}
        totalMatches={totalMatches}
      />

      {connection === 'down' && (
        <div className="pt-3">
          <LiveDownNotice />
        </div>
      )}

      {truncated && (
        <p
          role="alert"
          className="text-live mt-3 rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
        >
          試合の数が多すぎて、出しきれていない試合があるかもしれません。運営の方に知らせてください。
        </p>
      )}

      {board.length === 0 && (
        <div
          data-testid="matches-empty-notice"
          className="border-line mt-3 rounded-[14px] border bg-white px-[14px] py-5 text-center"
        >
          <p className="text-[15px] font-black">まだ試合が登録されていません</p>
          <p className="mt-2 text-[13px] text-gray-500">運営の方に確認してください。</p>
        </div>
      )}

      {board.length > 0 && openedCourt === null && (
        <div className="flex items-center gap-2 pt-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearching(true)}
            placeholder="選手名・チーム名で探す"
            aria-label="選手名・チーム名で探す"
            className={`h-[46px] min-w-0 flex-1 rounded-xl bg-white px-3.5 text-[14.5px] font-semibold shadow-[0_2px_4px_rgb(0_0_0/0.06)] outline-none placeholder:text-[#8a857d] ${
              searchActive ? 'border-ink border-[1.5px]' : 'border-btn-line border'
            }`}
          />
          {searchActive && (
            <button
              type="button"
              onClick={stopSearching}
              className="min-h-11 shrink-0 px-2 text-[14.5px] font-bold"
            >
              やめる
            </button>
          )}
        </div>
      )}

      {board.length > 0 && searchActive && openedCourt === null && (
        <SearchResults board={board} query={query} />
      )}

      {board.length > 0 && !searchActive && openedCourt === null && (
        <>
          <CourtChipStrip courts={chips} onSelect={scrollToCourt} />
          <div className="flex flex-col gap-2.5 pt-2">
            {numberedCourts.map((court) => (
              <CourtCard
                key={court.key}
                courtNumber={court.courtNumber as number}
                matches={court.matches}
                onOpen={showCourt}
              />
            ))}
            {undecidedCourt && (
              <section data-testid="matches-undecided" className="flex flex-col gap-2 pt-2">
                <h2 className="text-[12.5px] font-extrabold text-[#666]">コート未定</h2>
                <ul className="flex flex-col gap-2">
                  {undecidedCourt.matches.map((match) => (
                    <MatchRow key={match.matchId} match={match} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}

      {openedCourt !== null && (
        <>
          <CourtChipStrip
            courts={chips}
            activeCourt={openedCourt.courtNumber}
            onSelect={showCourt}
            onBack={() => showCourt(null)}
          />
          <CourtMatches
            courtNumber={openedCourt.courtNumber as number}
            matches={openedCourt.matches}
          />
        </>
      )}
    </div>
  );
}
