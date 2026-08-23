import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, logWrite, parseBody, toErrorResponse } from '@/server/route-helpers';
import { isPasscodeRequired } from '@/config/env.server';
import { createSession, destroySession, getSession, verifyPasscode } from '@/server/session';
import { getSupabaseAdminClient } from '@/db/admin';

/** 現在の入場状態を返す。 */
export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json({ session, passcodeRequired: isPasscodeRequired() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const enterSchema = z.object({
  /** 観戦者は名前も合言葉も無しで入る。既定は「名前を選んで入る人」。 */
  as: z.enum(['player', 'viewer']).default('player'),
  playerId: z.uuid({ message: '名前を選んでください' }).optional(),
  passcode: z.string().default(''),
});

/**
 * 入場。合言葉を検証し、選ばれた人が**いまの大会に参加している**ことを
 * サーバー側で確かめてから署名付き Cookie を発行する。
 * ブラウザから来た名前も can_input も信用しない。
 */
export async function POST(request: Request) {
  try {
    const { as, playerId, passcode } = await parseBody(request, enterSchema);

    // 観戦者は見るだけ。合言葉も名前も要らない（docs/specs/2026-08-23-enter-by-division.md）。
    if (as === 'viewer') {
      const session = { role: 'viewer' as const };
      await createSession(session);
      return NextResponse.json({ session });
    }

    if (!playerId) {
      throw new ApiError(400, '名前を選んでください。');
    }

    if (!verifyPasscode(passcode)) {
      throw new ApiError(401, '合言葉が違います。');
    }

    // 「いまの大会に参加しているか」まで確かめる。過去の大会にだけ出た人では入場できない。
    const { data: entry, error } = await getSupabaseAdminClient()
      .from('entries')
      .select('can_input, players!inner(id, number, name), competitions!inner(is_current)')
      .eq('player_id', playerId)
      .eq('competitions.is_current', true)
      .maybeSingle();

    if (error) throw error;
    if (!entry) {
      throw new ApiError(404, 'その名前は見つかりませんでした。一覧を更新してください。');
    }

    const session = {
      role: 'player' as const,
      playerId: entry.players.id,
      playerName: entry.players.name,
      playerNumber: entry.players.number,
      canInput: entry.can_input,
    };
    await createSession(session);
    await logWrite(session, 'session.enter');

    return NextResponse.json({ session });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 退場（別の人に端末を渡すとき用）。 */
export async function DELETE() {
  try {
    const session = await getSession();
    // 観戦者は誰かを名乗っていないので記録に残せない（残す名前が無い）
    if (session?.role === 'player') await logWrite(session, 'session.leave');
    await destroySession();
    return NextResponse.json({ session: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
