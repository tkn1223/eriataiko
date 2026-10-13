import {
  buildMatchesView,
  type MatchesView,
  type MatchesViewInput,
} from '@/usecases/build-matches-view';

/**
 * `/matches`（進行表）を開いたときに「どの画面を出すか」を決める。
 *
 * page.tsx に直接書かずにここへ切り出したのは、テストのため（`load-courts-page.ts` と同じ。
 * page.tsx は async な Server Component で Vitest では動かせない）。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

export type LoadMatchesPageDeps = {
  /** `src/db/me.ts` の同名関数。is_current の大会が無ければ null。 */
  findCurrentCompetitionId: () => Promise<string | null>;
  /** `src/db/matches-board.ts` の同名関数。 */
  findMatchesBoardData: (
    competitionId: string,
    playerId: string | null
  ) => Promise<MatchesViewInput>;
};

/** 入場の状態のうち、ここで使う部分だけ（`src/server/session.ts` の Session と同じ形）。 */
type SessionForMatches = { role: 'player'; playerId: string } | { role: 'viewer' } | null;

export type MatchesPageState =
  | {
      kind: 'ready';
      view: MatchesView;
      /** 「自分の試合」の絞り込みを出すか。選手として入った人だけ（観戦者には「全試合」だけ）。 */
      canFilterMine: boolean;
    }
  /** 大会が設定されていない（選手向けの案内を出す）。 */
  | { kind: 'not-found' }
  /** DB につながらない（開発者向けに理由をそのまま出す）。 */
  | { kind: 'connection-error'; message: string };

export async function loadMatchesPage(
  deps: LoadMatchesPageDeps,
  session: SessionForMatches
): Promise<MatchesPageState> {
  // 「自分の試合」も「あなたの試合」の印も、選手として入った人だけ。
  // 観戦者・未入場は誰の試合かが決まらないので、playerId を渡さない。
  const playerId = session?.role === 'player' ? session.playerId : null;

  try {
    const competitionId = await deps.findCurrentCompetitionId();
    if (!competitionId) return { kind: 'not-found' };

    const data = await deps.findMatchesBoardData(competitionId, playerId);
    return { kind: 'ready', view: buildMatchesView(data), canFilterMine: playerId !== null };
  } catch (error) {
    // 「大会が無い」は想定内の分岐（上の not-found）。ここに落ちるのは接続そのものの失敗。
    // 黙って空の画面にせず、理由を画面に出す。
    return {
      kind: 'connection-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
