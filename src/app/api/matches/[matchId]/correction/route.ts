import { NextResponse } from 'next/server';
import { logWrite, parseBody, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { correctMatch, correctMatchBodySchema } from '@/usecases/correct-match';

/**
 * 終わった試合の点と棄権を、終わったまま書き換える。入場した選手なら誰でもよい。
 * 全ゲームの点を送る（同じ内容を送り直しても同じ結果になる）。
 * 同点・1 点も無い・終わっていない試合は断る。詳しい分岐は `src/usecases/correct-match.ts` を参照。
 */
export async function PUT(
  request: Request,
  context: RouteContext<'/api/matches/[matchId]/correction'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;
    const body = await parseBody(request, correctMatchBodySchema);

    await correctMatch(matchesDb, { matchId, ...body, now: new Date() });
    await logWrite(player, 'match.correct', { matchId, ...body });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
