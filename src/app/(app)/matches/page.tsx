import { findCurrentCompetitionId } from '@/db/me';
import { findMatchesBoardData } from '@/db/matches-board';
import { getSession } from '@/server/session';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';
import { MatchesPage } from '@/ui/matches/matches-page';
import { loadMatchesPage } from '@/usecases/load-matches-page';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/(app)/courts/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 「大会が設定されていない」ときの案内。マイページ（`/me`）・結果LIVE と同じ文言にそろえる
 * （どれも本人には直せず、見分けが付かないため）。
 */
const NOT_FOUND_HEADING = '大会の情報が見つかりません';
const NOT_FOUND_MESSAGE = '運営の方に確認してください。';

/**
 * 「進行表」画面。コートごとに、終わった・進行中・これからの試合を見る。**見るだけ**
 * （得点を入れる場所は結果LIVE だけ）。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/matches-board.ts` の中）。
 * どの画面を出すか（読めた／大会が無い／つながらない）は `loadMatchesPage` が決める。
 * ここはそれを JSX にするだけ（分岐を Vitest で確かめられるようにするため）。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */
export default async function Page() {
  const state = await loadMatchesPage(
    { findCurrentCompetitionId, findMatchesBoardData },
    await getSession()
  );

  if (state.kind === 'connection-error') {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ConnectionErrorBlock message={state.message} />
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ErrorBlock heading={NOT_FOUND_HEADING} message={NOT_FOUND_MESSAGE} />
      </div>
    );
  }

  return (
    <MatchesPage
      board={state.view.board}
      canFilterMine={state.canFilterMine}
      truncated={state.view.truncated}
    />
  );
}
