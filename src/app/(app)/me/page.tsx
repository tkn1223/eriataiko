import { findMyPageData } from '@/db/me';
import { ErrorBlock } from '@/ui/components/error-block';
import { getSession } from '@/server/session';
import { buildMyPageView, type MyPageView } from '@/usecases/build-my-page-view';
import { MyPage } from '@/ui/me/my-page';
import { ViewerNotice } from '@/ui/me/viewer-notice';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/enter/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 読めなかったときの案内。
 * 「いまの大会が無い」と「その大会に自分が登録されていない」は、
 * どちらも本人には直せないうえ見分けが付かないので、両方を書いて運営に伝えてもらう。
 */
const NO_DATA_MESSAGE = '大会が設定されていないか、その大会にあなたの登録がありません';

/**
 * マイページ。読み取りは `createSupabaseServerClient()`（`src/db/me.ts` の中）。
 * 開いたときに 1 回だけ読む。自動では読み直さない
 * （得点のたびに全員が読み直すと Supabase の無料枠を使い切る）。
 */
export default async function MePage() {
  const session = await getSession();

  if (!session || session.role === 'viewer') {
    return <ViewerNotice />;
  }

  let view: MyPageView | null = null;
  let loadError: string | null = null;

  // JSX は try/catch の外で作る（中で作ると、失敗しても catch に落ちない）。
  try {
    const data = await findMyPageData(session.playerId);
    if (!data) {
      loadError = NO_DATA_MESSAGE;
    } else {
      view = buildMyPageView({
        myParticipantId: data.myParticipantId,
        profile: data.profile,
        divisions: data.divisions,
        matches: data.matches,
      });
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  if (!view) {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ErrorBlock message={loadError ?? NO_DATA_MESSAGE} />
      </div>
    );
  }

  return <MyPage profile={view.profile} record={view.record} matches={view.matches} />;
}
