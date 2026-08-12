import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, type OperatorSession } from '@/lib/session';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/**
 * 書き込み系 Route Handler の共通部品。
 *
 * 使い方:
 *
 *   export async function POST(request: Request) {
 *     try {
 *       const operator = await requireOperator();
 *       const body = await parseBody(request, z.object({ matchId: z.uuid(), score: z.number() }));
 *       const supabase = getSupabaseAdminClient();
 *       // ...書き込み...
 *       await logWrite(operator, 'score.update', body);
 *       return NextResponse.json({ ok: true });
 *     } catch (error) {
 *       return toErrorResponse(error);
 *     }
 *   }
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 入場済みでなければ 401。書き込み系ハンドラの先頭で必ず呼ぶ。 */
export async function requireOperator(): Promise<OperatorSession> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, '入場していません。もう一度名前を選んでください。');
  }
  return session;
}

/** リクエストボディを zod で検証する。壊れた入力は 400 で返す。 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError(400, 'リクエストの形式が不正です。');
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' / ');
    throw new ApiError(400, `入力が不正です（${detail}）`);
  }
  return result.data;
}

/**
 * 「誰が何をしたか」を write_logs に残す。
 * 大会後の突き合わせと、当日トラブル時の巻き戻し判断に使う。
 */
export async function logWrite(
  operator: OperatorSession,
  action: string,
  detail?: unknown
): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from('write_logs')
    .insert({
      operator_id: operator.operatorId,
      operator_name: operator.operatorName,
      action,
      detail: (detail ?? null) as Json,
    });

  // ログ失敗で本処理を落とさない。当日の運営が止まる方が損害が大きい。
  if (error) {
    console.error('[write_logs] 記録に失敗しました', { action, error });
  }
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[api] 想定外のエラー', error);
  return NextResponse.json(
    { error: 'サーバー側でエラーが起きました。少し待ってからやり直してください。' },
    { status: 500 }
  );
}
