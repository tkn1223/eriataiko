import { EntryGate, type Entrant, type EnterDivision, type EnterTeam } from '@/ui/enter/entry-gate';
import { ErrorBlock } from '@/ui/components/error-block';
import { isPasscodeRequired } from '@/config/env.server';
import { TOURNAMENT_NAME } from '@/config/tournament';
import { getSession, type OperatorSession } from '@/server/session';
import { createSupabaseServerClient } from '@/db/server';

// 入場状態（Cookie）を見るので常に動的レンダリング
export const dynamic = 'force-dynamic';

/** 入場画面。得点入力をする運営が「自分が誰か」を申告する。 */
export default async function EnterPage() {
  let session: OperatorSession | null = null;
  let competitionName = TOURNAMENT_NAME;
  let entrants: Entrant[] = [];
  let teams: EnterTeam[] = [];
  let divisions: EnterDivision[] = [];
  let passcodeRequired = false;
  let loadError: string | null = null;

  try {
    session = await getSession();
    passcodeRequired = isPasscodeRequired();

    // anon クライアントで読む = 観戦者にも同じものが見えることの確認になる。
    //
    // **大会はユーザーに選ばせない。** is_current が true の 1 件をここで決める。
    // 過去の大会にだけ出た人は一覧に出ない。
    const supabase = createSupabaseServerClient();

    const { data: competition, error: competitionError } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('is_current', true)
      .maybeSingle();

    if (competitionError) throw new Error(competitionError.message);

    if (competition) {
      competitionName = competition.name;

      const [entryResult, teamResult, divisionResult] = await Promise.all([
        supabase
          .from('entries')
          .select('id, can_input, team_id, division_id, players!inner(id, number, name)')
          .eq('competition_id', competition.id)
          .limit(500),
        supabase
          .from('teams')
          .select('id, number, name')
          .eq('competition_id', competition.id)
          .order('display_order')
          .limit(50),
        supabase
          .from('divisions')
          .select('id, name')
          .eq('competition_id', competition.id)
          .order('display_order')
          .limit(50),
      ]);

      if (entryResult.error) throw new Error(entryResult.error.message);
      if (teamResult.error) throw new Error(teamResult.error.message);
      if (divisionResult.error) throw new Error(divisionResult.error.message);

      // 番号順に並べる。DB 側で並べ替えると、つないだ表の列を指す書き方が
      // PostgREST の版に左右されるので、ここで確実に並べる。
      entrants = (entryResult.data ?? [])
        .map((row) => ({
          entryId: row.id,
          playerId: row.players.id,
          number: row.players.number,
          name: row.players.name,
          canInput: row.can_input,
          teamId: row.team_id,
          divisionId: row.division_id,
        }))
        .sort((a, b) => a.number - b.number);

      teams = teamResult.data ?? [];
      divisions = divisionResult.data ?? [];
    }
  } catch (error) {
    // 環境変数の未設定・DB 未接続はここに落ちる。画面に理由を出す。
    loadError = error instanceof Error ? error.message : String(error);
  }

  if (loadError) {
    return (
      <div className="bg-paper min-h-dvh px-4 py-8">
        <ErrorBlock message={loadError} />
      </div>
    );
  }

  return (
    <EntryGate
      competitionName={competitionName}
      entrants={entrants}
      teams={teams}
      divisions={divisions}
      passcodeRequired={passcodeRequired}
      session={session}
    />
  );
}
