import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, logWrite, parseBody, toErrorResponse } from '@/lib/api';
import { isPasscodeRequired } from '@/lib/env.server';
import { createSession, destroySession, getSession, verifyPasscode } from '@/lib/session';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

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
  operatorId: z.uuid({ message: '運営者を選んでください' }),
  passcode: z.string().default(''),
});

/**
 * 入場。合言葉を検証し、選ばれた運営者が実在することをサーバー側で確かめてから
 * 署名付き Cookie を発行する。ブラウザから来た名前は信用しない。
 */
export async function POST(request: Request) {
  try {
    const { operatorId, passcode } = await parseBody(request, enterSchema);

    if (!verifyPasscode(passcode)) {
      throw new ApiError(401, '合言葉が違います。');
    }

    const { data: operator, error } = await getSupabaseAdminClient()
      .from('operators')
      .select('id, name, is_active')
      .eq('id', operatorId)
      .maybeSingle();

    if (error) throw error;
    if (!operator || !operator.is_active) {
      throw new ApiError(404, 'その運営者は見つかりませんでした。一覧を更新してください。');
    }

    const session = { operatorId: operator.id, operatorName: operator.name };
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
    if (session) await logWrite(session, 'session.leave');
    await destroySession();
    return NextResponse.json({ session: null });
  } catch (error) {
    return toErrorResponse(error);
  }
}
