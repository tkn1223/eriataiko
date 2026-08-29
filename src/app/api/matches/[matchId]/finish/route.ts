import { NextResponse } from 'next/server';
import { logWrite, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { finishMatch } from '@/usecases/finish-match';

/**
 * 試合を終了する。1 点も入っていなければ止める（押し間違い防止）。
 * 既に done のときは何も変えずに成功を返す（二重押し対策）。
 * 詳しい分岐は `src/usecases/finish-match.ts` を参照。
 */
export async function POST(
  _request: Request,
  context: RouteContext<'/api/matches/[matchId]/finish'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;

    await finishMatch(matchesDb, { matchId, now: new Date() });
    await logWrite(player, 'match.finish', { matchId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
