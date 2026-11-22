import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { matchesLoadFailure } from '@/app/(app)/matches/load-failure';
import { findCurrentCompetitionId } from '@/db/me';
import { findMatchesBoardData } from '@/db/matches-board';
import { getSession } from '@/server/session';
import { CorrectMatchForm } from '@/ui/matches/correct-match-form';
import { loadMatchesPage } from '@/usecases/load-matches-page';

export const dynamic = 'force-dynamic';

/**
 * 直す画面（得点の訂正）。入場した選手だけが使える（観戦者には案内を出す。入口も断る）。
 * 終わっていない試合は直せない（試合中の点は試合速報で直す）ので、詳しい画面へ戻す。
 *
 * 画面に渡すのはこの試合だけ。直す前の値（「元は ◯」の元）を、開いた時点で固定するため、
 * 他の人の点の自動更新は受け取らない。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export default async function Page({ params }: PageProps<'/matches/[matchId]/correct'>) {
  const { matchId } = await params;
  const state = await loadMatchesPage(
    { findCurrentCompetitionId, findMatchesBoardData },
    await getSession()
  );

  if (state.kind !== 'ready') return matchesLoadFailure(state);

  const match = state.view.board.find((candidate) => candidate.matchId === matchId);
  if (!match) notFound();

  if (!state.isPlayer) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 text-center">
        <p className="text-[15px] font-black">訂正できるのは、選手として入場した人だけです</p>
        <p className="mt-2 text-[13px] text-gray-500">入場してから、もう一度開いてください。</p>
        <Link
          href={`/matches/${matchId}`}
          className="mt-4 inline-flex min-h-11 items-center text-[14px] font-bold"
        >
          ‹ 試合の詳しい画面へ戻る
        </Link>
      </div>
    );
  }

  if (match.status !== 'done') redirect(`/matches/${matchId}`);

  return <CorrectMatchForm match={match} />;
}
