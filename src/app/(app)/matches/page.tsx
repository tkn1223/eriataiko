import { findCurrentCompetitionId } from '@/db/me';
import { findMatchesBoardData } from '@/db/matches-board';
import { getSession } from '@/server/session';
import { matchesLoadFailure } from '@/app/(app)/matches/load-failure';
import { MatchesPage } from '@/ui/matches/matches-page';
import { loadMatchesPage } from '@/usecases/load-matches-page';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/(app)/courts/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 「進行表」画面。全コートのいま・次（1a）、コートの全試合（1b）、探す（1c）。
 * 点を入れるのは試合速報だけで、ここからは終わった試合の訂正だけ（詳しい画面から）。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/matches-board.ts` の中）。
 * どの画面を出すか（読めた／大会が無い／つながらない）は `loadMatchesPage` が決める。
 * ここはそれを JSX にするだけ（分岐を Vitest で確かめられるようにするため）。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 *       docs/specs/2026-11-22-matches-redesign.md
 */
export default async function Page({ searchParams }: PageProps<'/matches'>) {
  const courtParam = (await searchParams).court;
  const initialCourt = Number(Array.isArray(courtParam) ? courtParam[0] : courtParam);

  const state = await loadMatchesPage(
    { findCurrentCompetitionId, findMatchesBoardData },
    await getSession()
  );

  if (state.kind !== 'ready') return matchesLoadFailure(state);

  return (
    <MatchesPage
      board={state.view.board}
      truncated={state.view.truncated}
      initialCourt={Number.isInteger(initialCourt) && initialCourt > 0 ? initialCourt : null}
      stageLabel={state.view.stageLabel}
      completedMatches={state.view.completedMatches}
      totalMatches={state.view.totalMatches}
    />
  );
}
