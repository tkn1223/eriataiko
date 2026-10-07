import { findBracketData } from '@/db/bracket';
import { findCurrentCompetition } from '@/db/competition';
import { getSession } from '@/server/session';
import { loadBracketPage } from '@/usecases/load-bracket-page';
import { BracketPage } from '@/ui/bracket/bracket-page';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';

// 入場状態（Cookie）を見るので常に動的レンダリング（src/app/(app)/courts/page.tsx と同じ）
export const dynamic = 'force-dynamic';

/**
 * 「大会が設定されていない」ときの案内。マイページ（`/me`）・結果LIVE と同じ文言にそろえる
 * （どれも本人には直せず、見分けが付かないため）。
 */
const NOT_FOUND_HEADING = '大会の情報が見つかりません';
const NOT_FOUND_MESSAGE = '運営の方に確認してください。';

/** 予選リーグの対戦がまだ 1 つも登録されていないとき。 */
const NO_LEAGUE_HEADING = '予選リーグの組み合わせはまだありません';
const NO_LEAGUE_MESSAGE = '組み合わせが決まるまで、もうしばらくお待ちください。';

/**
 * 「対戦表」画面。予選リーグの星取表・順位表と、決勝トーナメントの勝ち上がり表。
 *
 * 読み取りは `createSupabaseServerClient()`（`src/db/bracket.ts` の中）。
 * 開いたときに 1 回だけ読む。自動では読み直さない
 * （得点のたびに全員が読み直すと Supabase の無料枠を使い切る）。
 *
 * どの画面を出すか（読めた／大会が無い／組み合わせが無い／つながらない）は
 * `loadBracketPage` が決める。ここはそれを JSX にするだけ
 * （分岐を Vitest で確かめられるようにするため。src/usecases/load-bracket-page.test.ts）。
 *
 * 仕様: docs/specs/2026-10-07-bracket-real-data.md
 */
export default async function Page() {
  const state = await loadBracketPage(
    { findCurrentCompetition, findBracketData },
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

  if (state.kind === 'no-league') {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ErrorBlock heading={NO_LEAGUE_HEADING} message={NO_LEAGUE_MESSAGE} />
      </div>
    );
  }

  return (
    <BracketPage
      teams={state.view.teams}
      leagueCards={state.view.leagueCards}
      standings={state.view.standings}
      koBracket={state.view.koBracket}
      truncated={state.view.truncated}
    />
  );
}
