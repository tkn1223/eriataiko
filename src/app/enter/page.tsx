import { EntryGate } from '@/ui/enter/entry-gate';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { TOURNAMENT_NAME } from '@/config/tournament';
import { getSession, type Session } from '@/server/session';
import { findEntryOptions, type EntryOptions } from '@/db/entry-options';
import { redirect } from 'next/navigation';

// 入場状態（Cookie）を見るので常に動的レンダリング
export const dynamic = 'force-dynamic';

/** 入場画面。得点入力をする運営が「自分が誰か」を申告する。 */
export default async function EnterPage() {
  let session: Session | null = null;
  let options: EntryOptions | null = null;
  let loadError: string | null = null;

  try {
    session = await getSession();
    options = await findEntryOptions();
  } catch (error) {
    // 環境変数の未設定・DB 未接続はここに落ちる。画面に理由を出す。
    loadError = error instanceof Error ? error.message : String(error);
  }

  // 入場済みの人に「入場中」の画面は出さない。用は済んでいるので大会の画面へ送る。
  // 入り直したい人は、マイページのボタンで退場してから来る（src/ui/enter/reenter-button.tsx）。
  // try の外で呼ぶ（redirect は例外を投げて止める作りなので、catch に拾われないように）。
  if (session) redirect('/');

  if (loadError || !options) {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ConnectionErrorBlock message={loadError ?? '読み込めませんでした。'} />
      </div>
    );
  }

  return (
    <EntryGate
      competitionName={options.competitionName ?? TOURNAMENT_NAME}
      entrants={options.entrants}
      teams={options.teams}
      divisions={options.divisions}
      passcodeRequired={options.passcodeRequired}
    />
  );
}
