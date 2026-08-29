import { NextResponse } from 'next/server';
import { logWrite, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { finishMatch } from '@/usecases/finish-match';
import { reopenMatch } from '@/usecases/reopen-match';

/**
 * 試合の結果。
 *
 * **「終了する」「取り消す」を動詞のパスにしていない。** 動詞にすると
 * 入口が増えるたびに名前を考えることになり、対になっていることも読めない。
 * 結果というモノを作る（POST）／消す（DELETE）と見れば、
 * 2 つが表裏であることがパスから分かる。
 *
 * 「1 点も入っていなければ止める」のような大会のルールはここには書かない。
 * 判断は `src/usecases/` にあり、ここは受け取って渡すだけ。
 */

/**
 * 試合を終了する。1 点も入っていなければ止める（押し間違い防止）。
 * 既に done のときは何も変えずに成功を返す（二重押し対策）。
 * 詳しい分岐は `src/usecases/finish-match.ts` を参照。
 */
export async function POST(
  _request: Request,
  context: RouteContext<'/api/matches/[matchId]/result'>
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

/**
 * 終了を取り消す。`done` の試合を `live` に戻し、`finished_at` を空にする。
 * `done` でない試合に送っても、何も変えずに成功を返す。
 * 詳しい分岐は `src/usecases/reopen-match.ts` を参照。
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/matches/[matchId]/result'>
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
