import type { MatchesPageState } from '@/usecases/load-matches-page';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';

/**
 * 「大会が設定されていない」ときの案内。マイページ（`/me`）・試合速報と同じ文言にそろえる
 * （どれも本人には直せず、見分けが付かないため）。
 */
const NOT_FOUND_HEADING = '大会の情報が見つかりません';
const NOT_FOUND_MESSAGE = '運営の方に確認してください。';

/**
 * 進行表の 3 つの画面（一覧・詳しい画面・直す画面）で、読めなかったときに出すもの。
 * 読めたとき（`ready`）は null。
 */
export function matchesLoadFailure(state: MatchesPageState) {
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
  return null;
}
