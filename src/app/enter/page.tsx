import { EntryGate, type Operator } from '@/components/entry-gate';
import { PlainPage } from '@/components/plain-page';
import { ErrorBlock } from '@/components/ui/error-block';
import { isPasscodeRequired } from '@/lib/env.server';
import { getSession, type OperatorSession } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// 入場状態（Cookie）を見るので常に動的レンダリング
export const dynamic = 'force-dynamic';

/** 入場画面。得点入力をする運営が「自分が誰か」を申告する。 */
export default async function EnterPage() {
  let session: OperatorSession | null = null;
  let operators: Operator[] = [];
  let passcodeRequired = false;
  let loadError: string | null = null;

  try {
    session = await getSession();
    passcodeRequired = isPasscodeRequired();

    // anon クライアントで読む = 観戦者にも同じものが見えることの確認になる
    const { data, error } = await createSupabaseServerClient()
      .from('operators')
      .select('id, name')
      .order('display_order')
      .order('name');

    if (error) throw new Error(error.message);
    operators = data ?? [];
  } catch (error) {
    // 環境変数の未設定・DB 未接続はここに落ちる。画面に理由を出す。
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <PlainPage title="入場">
      {loadError ? (
        <ErrorBlock message={loadError} />
      ) : (
        <EntryGate operators={operators} passcodeRequired={passcodeRequired} session={session} />
      )}
    </PlainPage>
  );
}
