import { notFound } from 'next/navigation';
import { matchesLoadFailure } from '@/app/(app)/matches/load-failure';
import { findCurrentCompetitionId } from '@/db/me';
import { findMatchesBoardData } from '@/db/matches-board';
import { getSession } from '@/server/session';
import { MatchDetail } from '@/ui/matches/match-detail';
import { loadMatchesPage } from '@/usecases/load-matches-page';

// 入場状態（Cookie）を見るので常に動的レンダリング（進行表の一覧と同じ）
export const dynamic = 'force-dynamic';

/** `?corrected=<直したゲーム番号>`。訂正から戻ってきたときだけ付く。0 は点を直していない。 */
function correctedOf(value: string | string[] | undefined): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined) return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/**
 * 試合の詳しい画面。試合中・これからは得点板と試合速報への入り口（1d）、
 * 終わった試合は点の表と［得点を訂正する］（1e）。訂正から戻ったときは緑の帯（2c）。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/matches-board.ts` の中）。
 * 書き込みは無い（訂正は直す画面から `PUT /api/matches/[matchId]/correction`）。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export default async function Page({ params, searchParams }: PageProps<'/matches/[matchId]'>) {
  const { matchId } = await params;
  const corrected = correctedOf((await searchParams).corrected);
  const state = await loadMatchesPage(
    { findCurrentCompetitionId, findMatchesBoardData },
    await getSession()
  );

  if (state.kind !== 'ready') return matchesLoadFailure(state);
  // 一覧に無い（別の大会の試合・消えた試合・でたらめな id）
  if (!state.view.board.some((match) => match.matchId === matchId)) notFound();

  return (
    <MatchDetail
      board={state.view.board}
      matchId={matchId}
      scorerNames={state.view.scorerNames}
      canCorrect={state.isPlayer}
      corrected={corrected}
      stageLabel={state.view.stageLabel}
      completedMatches={state.view.completedMatches}
      totalMatches={state.view.totalMatches}
    />
  );
}
