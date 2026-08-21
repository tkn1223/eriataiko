import { EntryGate, type Entrant } from '@/ui/enter/entry-gate';
import { PlainPage } from '@/ui/components/plain-page';
import { ErrorBlock } from '@/ui/components/error-block';
import { isPasscodeRequired } from '@/config/env.server';
import { getSession, type OperatorSession } from '@/server/session';
import { createSupabaseServerClient } from '@/db/server';

// 入場状態（Cookie）を見るので常に動的レンダリング
export const dynamic = 'force-dynamic';

/** 入場画面。得点入力をする運営が「自分が誰か」を申告する。 */
export default async function EnterPage() {
  let session: OperatorSession | null = null;
  let entrants: Entrant[] = [];
  let passcodeRequired = false;
  let loadError: string | null = null;

  try {
    session = await getSession();
    passcodeRequired = isPasscodeRequired();

    // anon クライアントで読む = 観戦者にも同じものが見えることの確認になる。
    //
    // **大会はユーザーに選ばせない。** is_current が true の 1 件をここで決める。
    // 過去の大会にだけ出た人は一覧に出ない。
    const { data, error } = await createSupabaseServerClient()
      .from('entries')
      .select('id, can_input, players!inner(id, number, name), competitions!inner(is_current)')
      .eq('competitions.is_current', true)
      .limit(500);

    if (error) throw new Error(error.message);

    // 番号順に並べる。DB 側で並べ替えると、つないだ表の列を指す書き方が
    // PostgREST の版に左右されるので、ここで確実に並べる。
    entrants = (data ?? [])
      .map((row) => ({
        entryId: row.id,
        playerId: row.players.id,
        number: row.players.number,
        name: row.players.name,
        canInput: row.can_input,
      }))
      .sort((a, b) => a.number - b.number);
  } catch (error) {
    // 環境変数の未設定・DB 未接続はここに落ちる。画面に理由を出す。
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <PlainPage title="入場">
      {loadError ? (
        <ErrorBlock message={loadError} />
      ) : (
        <EntryGate entrants={entrants} passcodeRequired={passcodeRequired} session={session} />
      )}
    </PlainPage>
  );
}
