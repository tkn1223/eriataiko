import { findCourtsData } from '@/db/courts';
import { findCurrentCompetitionId } from '@/db/me';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';
import { getSession } from '@/server/session';
import { loadCourtsPage } from '@/usecases/load-courts-page';
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
 * どの画面を出すか（読めた／大会が無い／つながらない、押せるか）は
 * `loadCourtsPage` が決める。ここはそれを JSX にするだけ
 * （分岐を Vitest で確かめられるようにするため。src/usecases/load-courts-page.test.ts）。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 */
export default async function Page() {
  const state = await loadCourtsPage(
    { findCurrentCompetitionId, findCourtsData },
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
    <CourtsPage
      courts={state.view.courts}
      stageLabel={state.view.stageLabel}
      completedMatches={state.view.completedMatches}
      totalMatches={state.view.totalMatches}
      canInput={state.canInput}
    />
  );
}
