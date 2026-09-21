import {
  buildCourtsView,
  type CourtsView,
  type CourtsViewInput,
} from '@/usecases/build-courts-view';

/**
 * `/courts`（結果LIVE）を開いたときに「どの画面を出すか」を決める。
 *
 * page.tsx に直接書かずにここへ切り出したのは、テストのため。page.tsx は async な
 * Server Component で Vitest では動かせず、「大会が無い」「つながらない」を e2e で
 * 起こすには手元の DB を壊すしかない。読み込みを引数で受け取れば、偽物に差し替えて
 * 分岐を全部確かめられる（src/usecases/README.md の書き方）。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 */

export type LoadCourtsPageDeps = {
  /** `src/db/me.ts` の同名関数。is_current の大会が無ければ null。 */
  findCurrentCompetitionId: () => Promise<string | null>;
  /** `src/db/courts.ts` の同名関数。 */
  findCourtsData: (competitionId: string, playerId: string | null) => Promise<CourtsViewInput>;
};

/** 入場の状態のうち、ここで使う部分だけ（`src/server/session.ts` の Session と同じ形）。 */
type SessionForCourts = { role: 'player'; playerId: string } | { role: 'viewer' } | null;

export type CourtsPageState =
  | { kind: 'ready'; view: CourtsView; canInput: boolean }
  /** 大会が設定されていない（選手向けの案内を出す）。 */
  | { kind: 'not-found' }
  /** DB につながらない（開発者向けに理由をそのまま出す）。 */
  | { kind: 'connection-error'; message: string };

export async function loadCourtsPage(
  deps: LoadCourtsPageDeps,
  session: SessionForCourts
): Promise<CourtsPageState> {
  // 選手として入った人だけが得点を押せる。観戦者・未入場は見るだけで、
  // 「あなたの試合」も付けない（仕様の「決めたこと」3）。
  const playerId = session?.role === 'player' ? session.playerId : null;

  try {
    const competitionId = await deps.findCurrentCompetitionId();
    if (!competitionId) return { kind: 'not-found' };

    const data = await deps.findCourtsData(competitionId, playerId);
    return { kind: 'ready', view: buildCourtsView(data), canInput: playerId !== null };
  } catch (error) {
    // 「大会が無い」は想定内の分岐（上の not-found）で扱う。
    // ここに落ちるのは接続そのものの失敗。黙って空の画面にせず、理由を画面に出す。
    return {
      kind: 'connection-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
