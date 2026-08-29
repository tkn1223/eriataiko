import { NextResponse } from 'next/server';
import { logWrite, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { reopenMatch } from '@/usecases/reopen-match';

/**
 * 終了を取り消す。`done` の試合を `live` に戻し、`finished_at` を空にする。
 * `done` でない試合に送っても、何も変えずに成功を返す。
 * 詳しい分岐は `src/usecases/reopen-match.ts` を参照。
 */
export async function POST(
  _request: Request,
  context: RouteContext<'/api/matches/[matchId]/reopen'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;

    await reopenMatch(matchesDb, { matchId });
    await logWrite(player, 'match.reopen', { matchId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
