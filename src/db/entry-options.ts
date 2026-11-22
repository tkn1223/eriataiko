import 'server-only';

import { isPasscodeRequired } from '@/config/env.server';
import { createSupabaseServerClient } from '@/db/server';
import type { Entrant, EnterDivision, EnterTeam } from '@/ui/enter/entry-gate';

/**
 * 名前選び（`EntryGate`）に要るデータ。入場画面（/enter）と、観戦者が開いた myページ（/me）の
 * 両方が使うので、ここに 1 か所だけ置く。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 失敗したときは例外を投げる。画面に出す日本語は呼ぶ側が決める。
 */
export type EntryOptions = {
  /** いまの大会が無ければ null（呼ぶ側が既定の大会名を使う） */
  competitionName: string | null;
  entrants: Entrant[];
  teams: EnterTeam[];
  divisions: EnterDivision[];
  passcodeRequired: boolean;
};

export async function findEntryOptions(): Promise<EntryOptions> {
  const passcodeRequired = isPasscodeRequired();

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

  if (!competition) {
    return { competitionName: null, entrants: [], teams: [], divisions: [], passcodeRequired };
  }

  const [entryResult, teamResult, divisionResult] = await Promise.all([
    supabase
      .from('participants')
      .select('id, team_id, division_id, players!inner(id, player_number, name)')
      .eq('competition_id', competition.id)
      .limit(500),
    supabase
      .from('teams')
      .select('id, team_number, name')
      .eq('competition_id', competition.id)
      .order('sort_order')
      .limit(50),
    supabase
      .from('divisions')
      .select('id, name')
      .eq('competition_id', competition.id)
      .order('sort_order')
      .limit(50),
  ]);

  if (entryResult.error) throw new Error(entryResult.error.message);
  if (teamResult.error) throw new Error(teamResult.error.message);
  if (divisionResult.error) throw new Error(divisionResult.error.message);

  // 番号順に並べる。DB 側で並べ替えると、つないだ表の列を指す書き方が
  // PostgREST の版に左右されるので、ここで確実に並べる。
  const entrants: Entrant[] = (entryResult.data ?? [])
    .map((row) => ({
      participantId: row.id,
      playerId: row.players.id,
      playerNumber: row.players.player_number,
      name: row.players.name,
      teamId: row.team_id,
      divisionId: row.division_id,
    }))
    .sort((a, b) => a.playerNumber - b.playerNumber);

  const teams: EnterTeam[] = (teamResult.data ?? []).map((row) => ({
    id: row.id,
    teamNumber: row.team_number,
    name: row.name,
  }));

  return {
    competitionName: competition.name,
    entrants,
    teams,
    divisions: divisionResult.data ?? [],
    passcodeRequired,
  };
}
