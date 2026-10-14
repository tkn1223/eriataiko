import { NextResponse } from 'next/server';
import { logWrite, parseBody, requirePlayer, toErrorResponse } from '@/server/route-helpers';
import { matchesDb } from '@/db/matches';
import { claimScorer, claimScorerBodySchema } from '@/usecases/claim-scorer';
import { releaseScorer } from '@/usecases/release-scorer';

/**
 * 試合の入力担当（同じ試合を 2 人が同時に入れられないようにする）。
 *
 * 担当は**試合**に付く（コートではない）。担当というモノを作る（POST）／やめる（DELETE）と見て、
 * 動詞のパスにしていない（`result/route.ts` と同じ考え方）。
 *
 * 「5 分で外れる」「引き継ぐと明示したときだけ取れる」といった決まりはここには書かない。
 * 判断は `src/usecases/` と `src/domain/scorer.ts` にあり、ここは受け取って渡すだけ。
 * 観戦者は `requirePlayer` が 403 で止める。
 */

/**
 * 担当を取る。本文 `{ takeOver?: boolean }`（本文が空なら引き継がない）。
 * 空いている／5 分たった担当は確認なしで取れる。ほかの人が担当中なら、`takeOver: true` のときだけ取れる
 * （そうでなければ 409・code `scorer-active`）。もう自分が担当なら担当になった時刻を新しくするだけで成功を返す。
 * 詳しい分岐は `src/usecases/claim-scorer.ts` を参照。
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/matches/[matchId]/scorer'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;
    // 本文なしの POST を 400 にしない。parseBody は空の本文を「形式が不正」にするので、先に有無を見る
    const hasBody = (await request.clone().text()).trim() !== '';
    const body = hasBody ? await parseBody(request, claimScorerBodySchema) : {};

    const result = await claimScorer(matchesDb, {
      matchId,
      playerId: player.playerId,
      takeOver: body.takeOver ?? false,
      now: new Date(),
    });
    // 取り直し（もう自分が担当）は新しい出来事ではないので残さない。電波で返事が失われて押し直された
    // 取る操作が、記録を二重に増やさないように
    if (result.outcome === 'took-over') {
      await logWrite(player, 'scorer.takeover', { matchId, from: result.previousLabel });
    } else if (result.outcome === 'claimed') {
      await logWrite(player, 'scorer.claim', { matchId });
    }

    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * 担当をやめる。自分が担当のときだけ外れる。ほかの人が担当中なら 409（code `not-scorer`）。
 * 誰も担当でなければ、何も変えずに成功を返す。
 * 詳しい分岐は `src/usecases/release-scorer.ts` を参照。
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/matches/[matchId]/scorer'>
) {
  try {
    const player = await requirePlayer();
    const { matchId } = await context.params;

    const result = await releaseScorer(matchesDb, {
      matchId,
      playerId: player.playerId,
      now: new Date(),
    });
    if (result.outcome === 'released') {
      await logWrite(player, 'scorer.release', { matchId });
    }

    return NextResponse.json({ ok: true, outcome: result.outcome });
  } catch (error) {
    return toErrorResponse(error);
  }
}
