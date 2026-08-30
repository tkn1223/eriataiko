import { findCourtsPageData } from '@/db/courts';
import { getSession } from '@/server/session';
import { buildCourtsView } from '@/usecases/build-courts-view';
import { CourtsPage } from '@/ui/courts/courts-page';

/**
 * 「結果LIVE」画面。当日いちばん見られる画面。トップ（/）を開くとここに飛ぶ。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/courts.ts` の中）。1 回で読む。
 */
export default async function Page() {
  const [pageData, session] = await Promise.all([findCourtsPageData(), getSession()]);

  const courts = buildCourtsView({
    currentPlayerId: session?.role === 'player' ? session.playerId : null,
    matches: pageData.matches,
  });

  return (
    <CourtsPage
      courts={courts}
      completedMatches={pageData.completedMatches}
      totalMatches={pageData.totalMatches}
      canEdit={session?.role === 'player'}
    />
  );
}
