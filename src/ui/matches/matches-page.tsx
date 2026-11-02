'use client';

import { useState } from 'react';
import { LiveDownNotice } from '@/ui/components/live-down-notice';
import { CourtCard } from '@/ui/matches/court-card';
import { deriveMatchesCourts } from '@/ui/matches/derive-matches-courts';
import { useLiveMatches } from '@/ui/matches/use-live-matches';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  /**
   * 試合の一覧（読み込んだ時点の様子）。コートのカードはここから組み立てる。
   * 読み直されて新しい一覧が渡されたら、画面が持っている様子を置き換える。
   */
  board: BoardMatch[];
  /**
   * 「自分の試合」の絞り込みを出すか。選手として入った人だけ true。
   * 観戦者には「全試合」だけを出す（誰の試合かが決まらないため）。
   */
  canFilterMine: boolean;
  /** 読む上限を超えて、試合が出しきれていないかもしれない。 */
  truncated: boolean;
};

type Filter = 'all' | 'mine';

/**
 * 進行表画面。**見るだけの画面**（得点を入れる場所は結果LIVE だけ。
 * docs/specs/2026-10-14-matches-real-data.md の「決めたこと」1）。
 *
 * 渡す props は `page.tsx` が DB から組み立てる（`src/usecases/build-matches-view.ts`）。
 * 他の人の点や試合の終了は `use-live-matches.ts` が結果LIVE と同じ購読で受け取り、届いた行だけを
 * 一覧に当てる（点が変わるたびに画面全体を読み直さない）。
 */
export function MatchesPage({ board: serverBoard, canFilterMine, truncated }: Props) {
  // 他の人の点や試合の終了は、結果LIVE と同じ購読で受け取って一覧に当てる
  const { board, connection } = useLiveMatches(serverBoard);
  const [filter, setFilter] = useState<Filter>('all');
  const [openCourts, setOpenCourts] = useState<Record<string, boolean>>({});
  const [shownDoneCourts, setShownDoneCourts] = useState<Record<string, boolean>>({});

  const courts = deriveMatchesCourts(board);

  // 絞り込みは「並べる試合」だけを減らす。見出しの「残り◯試合」「現在◯試合目」は
  // コートの進み具合なので、絞り込んでも全試合から出す（でないと自分の試合が 1 つ終わった
  // だけのコートが「すべて終了」と出てしまう）。
  const onlyMine = canFilterMine && filter === 'mine';
  const visibleCourts = courts
    .map((court) => ({
      court,
      listedMatches: onlyMine ? court.matches.filter((match) => match.isMine) : court.matches,
    }))
    .filter(({ listedMatches }) => !onlyMine || listedMatches.length > 0);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h1 className="mb-[14px] text-[18px] font-black">進行表</h1>

      <div className="mb-[14px] flex gap-2">
        <FilterPill label="全試合" active={!onlyMine} onClick={() => setFilter('all')} />
        {canFilterMine && (
          <FilterPill label="自分の試合" active={onlyMine} onClick={() => setFilter('mine')} />
        )}
      </div>

      {connection === 'down' && <LiveDownNotice />}

      {truncated && (
        <p
          role="alert"
          className="text-live mb-[14px] rounded-[10px] bg-red-100 px-3 py-2 text-[12px] font-extrabold"
        >
          試合の数が多すぎて、出しきれていない試合があるかもしれません。運営の方に知らせてください。
        </p>
      )}

      {board.length === 0 && (
        <div
          data-testid="matches-empty-notice"
          className="rounded-[14px] border border-gray-200 bg-white px-[14px] py-5 text-center"
        >
          <p className="text-[15px] font-black">まだ試合が登録されていません</p>
          <p className="mt-2 text-[13px] text-gray-500">運営の方に確認してください。</p>
        </div>
      )}

      {board.length > 0 && visibleCourts.length === 0 && (
        <div
          data-testid="matches-no-mine-notice"
          className="rounded-[14px] border border-gray-200 bg-white px-[14px] py-5 text-center"
        >
          <p className="text-[15px] font-black">あなたの試合は見つかりませんでした</p>
          <p className="mt-2 text-[13px] text-gray-500">
            「全試合」を押すと、すべての試合が見られます。
          </p>
        </div>
      )}

      {visibleCourts.map(({ court, listedMatches }) => (
        <CourtCard
          key={court.key}
          courtNumber={court.courtNumber}
          allMatches={court.matches}
          listedMatches={listedMatches}
          isOpen={openCourts[court.key] ?? false}
          showDone={shownDoneCourts[court.key] ?? false}
          onToggleOpen={() => setOpenCourts((prev) => ({ ...prev, [court.key]: !prev[court.key] }))}
          onToggleShowDone={() =>
            setShownDoneCourts((prev) => ({ ...prev, [court.key]: !prev[court.key] }))
          }
        />
      ))}
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
