import { findCurrentCompetitionId, findMyPageData } from '@/db/me';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';
import { getSession } from '@/server/session';
import { buildMyPageView, type MyPageView } from '@/usecases/build-my-page-view';
import { MyPage } from '@/ui/me/my-page';
import { ViewerNotice } from '@/ui/me/viewer-notice';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/enter/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 「大会が設定されていない」「その大会にあなたの登録がない」ときの選手向けの案内。
 *
 * どちらも本人には直せないうえ見分けが付かないので同じ文言にする。
 * **「Supabase につながらない」（開発者向け）とは見出しを分ける。** 当日これを見るのは選手なので、
 * `.env.local` や `npm run` の案内を出さない（PR #53 レビュー指摘4）。
 */
const NOT_FOUND_HEADING = '大会の情報が見つかりません';
const NOT_FOUND_MESSAGE = '運営の方に確認してください。';

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
  let notFound = false;
  let connectionError: string | null = null;

  // JSX は try/catch の外で作る（中で作ると、失敗しても catch に落ちない）。
  try {
    const competitionId = await findCurrentCompetitionId();
    if (!competitionId) {
      notFound = true;
    } else {
      const data = await findMyPageData(session.playerId, competitionId);
      if (!data) {
        notFound = true;
      } else {
        view = buildMyPageView({
          myParticipantId: data.myParticipantId,
          profile: data.profile,
          divisions: data.divisions,
          matches: data.matches,
        });
      }
    }
  } catch (error) {
    // 「大会や登録が無い」は想定内の分岐（上の notFound）で扱う。
    // ここに落ちるのは接続そのものの失敗（開発者向け）。
    connectionError = error instanceof Error ? error.message : String(error);
  }

  if (connectionError) {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ConnectionErrorBlock message={connectionError} />
      </div>
    );
  }

  if (notFound || !view) {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ErrorBlock heading={NOT_FOUND_HEADING} message={NOT_FOUND_MESSAGE} />
      </div>
    );
  }

  return <MyPage profile={view.profile} record={view.record} matches={view.matches} />;
}
