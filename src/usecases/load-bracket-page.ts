import {
  buildBracketView,
  type BracketView,
  type BracketViewInput,
} from '@/usecases/build-bracket-view';

/**
 * `/bracket`（対戦表）を開いたときに「どの画面を出すか」を決める。
 *
 * page.tsx に直接書かずにここへ切り出したのは、テストのため。page.tsx は async な
 * Server Component で Vitest では動かせず、「大会が無い」「つながらない」を e2e で
 * 起こすには手元の DB を壊すしかない。読み込みを引数で受け取れば、偽物に差し替えて
 * 分岐を全部確かめられる（src/usecases/README.md の書き方。`load-courts-page.ts` と同じ）。
 *
 * 仕様: docs/specs/2026-10-07-bracket-real-data.md
 */

export type LoadBracketPageDeps = {
  /** `src/db/competition.ts` の同名関数。is_current の大会が無ければ null。 */
  findCurrentCompetition: () => Promise<{ id: string } | null>;
  /** `src/db/bracket.ts` の同名関数。 */
  findBracketData: (competitionId: string, playerId: string | null) => Promise<BracketViewInput>;
};

/** 入場の状態のうち、ここで使う部分だけ（`src/server/session.ts` の Session と同じ形）。 */
type SessionForBracket = { role: 'player'; playerId: string } | { role: 'viewer' } | null;

export type BracketPageState =
  | { kind: 'ready'; view: BracketView }
  /** 大会が設定されていない（選手向けの案内を出す）。 */
  | { kind: 'not-found' }
  /** 大会はあるが、予選リーグの組み合わせがまだ登録されていない。 */
  | { kind: 'no-league' }
  /** DB につながらない（開発者向けに理由をそのまま出す）。 */
  | { kind: 'connection-error'; message: string };

export async function loadBracketPage(
  deps: LoadBracketPageDeps,
  session: SessionForBracket
): Promise<BracketPageState> {
  // 自分のチームの印を付けるのは、選手として入った人だけ（観戦者・未入場には付けない）。
  const playerId = session?.role === 'player' ? session.playerId : null;

  try {
    const competition = await deps.findCurrentCompetition();
    if (!competition) return { kind: 'not-found' };

    const data = await deps.findBracketData(competition.id, playerId);
    const view = buildBracketView(data);
    if (!view.hasLeagueMatchups) return { kind: 'no-league' };
    return { kind: 'ready', view };
  } catch (error) {
    // 「大会が無い」「組み合わせが無い」は想定内の分岐（上）で扱う。
    // ここに落ちるのは接続そのものの失敗。黙って空の画面にせず、理由を画面に出す。
    return {
      kind: 'connection-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
