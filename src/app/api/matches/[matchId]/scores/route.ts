import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logWrite, parseBody, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { saveScore } from '@/usecases/save-score';

const scoreSchema = z.object({
  gameNumber: z.number().int().min(1, { message: 'ゲーム番号は 1 以上にしてください。' }),
  sideAScore: z.number().int().min(0, { message: '得点は 0 以上にしてください。' }),
  sideBScore: z.number().int().min(0, { message: '得点は 0 以上にしてください。' }),
});

/**
 * 得点を保存する。**今の点数をそのまま送る**方式（「1 点足して」ではない）。
 * 詳しい分岐は `src/usecases/save-score.ts` を参照。
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/matches/[matchId]/scores'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;
    const body = await parseBody(request, scoreSchema);

    await saveScore(matchesDb, { matchId, ...body, now: new Date() });
    await logWrite(player, 'score.save', { matchId, ...body });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
