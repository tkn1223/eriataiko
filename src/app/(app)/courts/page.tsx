import { findCourtsData } from '@/db/courts';
import { findCurrentCompetitionId } from '@/db/me';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';
import { getSession } from '@/server/session';
import { buildCourtsView, type CourtsView } from '@/usecases/build-courts-view';
import { CourtsPage } from '@/ui/courts/courts-page';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/(app)/me/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 「大会が設定されていない」ときの案内。マイページ（`/me`）と同じ文言にそろえる
 * （どちらも本人には直せず、見分けが付かないため）。
 */
const NOT_FOUND_HEADING = '大会の情報が見つかりません';
const NOT_FOUND_MESSAGE = '運営の方に確認してください。';

/**
 * 「結果LIVE」画面。当日いちばん見られる画面。トップ（/）を開くとここに飛ぶ。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/courts.ts` の中）。
 * 開いたときに 1 回だけ読む。自動では読み直さない
 * （得点のたびに全員が読み直すと Supabase の無料枠を使い切る）。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 */
export default async function Page() {
  const session = await getSession();
  // 選手として入った人だけが得点を押せる。観戦者・未入場は見るだけ
  // （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」3）。
  const canInput = session?.role === 'player';
  const playerId = session?.role === 'player' ? session.playerId : null;

  let view: CourtsView | null = null;
  let notFound = false;
  let connectionError: string | null = null;

  // JSX は try/catch の外で作る（中で作ると、失敗しても catch に落ちない）。
  try {
    const competitionId = await findCurrentCompetitionId();
    if (!competitionId) {
      notFound = true;
    } else {
      const data = await findCourtsData(competitionId, playerId);
      view = buildCourtsView({
        myParticipantId: data.myParticipantId,
        divisions: data.divisions,
        stages: data.stages,
        matches: data.matches,
      });
    }
  } catch (error) {
    // 「大会が無い」は想定内の分岐（上の notFound）で扱う。
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

  return (
    <CourtsPage
      courts={view.courts}
      stageLabel={view.stageLabel}
      completedMatches={view.completedMatches}
      totalMatches={view.totalMatches}
      canInput={canInput}
    />
  );
}
