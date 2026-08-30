import 'server-only';

import { createSupabaseServerClient } from '@/db/server';
import type { CourtsViewMatchRow, CourtsViewPlayerRow } from '@/usecases/build-courts-view';

/**
 * `/courts`（結果LIVE）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 表と列がいくつも絡む（matches → matchups → teams、match_players → participants → players）ので、
 * 1 回の入れ子クエリにはせず、素朴に何回かに分けて読んで JS 側で組み立てる
 * （`src/db/matches.ts` と同じ方針）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * 手作業で回せる大会の規模を踏まえた余裕を持った数にしている。
 */
const MAX_MATCHES = 500;
const MAX_ROWS = 2000;

type SupabaseReadClient = ReturnType<typeof createSupabaseServerClient>;

type Division = { id: string; name: string };

export type CourtsPageData = {
  /** コートが割り当てられた、まだ終わっていない試合。 */
  matches: CourtsViewMatchRow[];
  /** 見出しの「◯/◯ 試合消化」。**行を数えるだけ**で、勝敗も順位も見ない。 */
  completedMatches: number;
  totalMatches: number;
};

/**
 * `/courts` が要るものをまとめて読む。
 *
 * 試合の一覧と「◯/◯ 試合消化」で同じ「いまの大会の部」を起点にするので、
 * 1 つの入口にして大会・部を 2 度読まないようにしている（体育館の電波が細い）。
 */
export async function findCourtsPageData(): Promise<CourtsPageData> {
  const supabase = createSupabaseServerClient();
  const divisions = await findCurrentDivisions(supabase);
  if (divisions.length === 0) return { matches: [], completedMatches: 0, totalMatches: 0 };

  const divisionIds = divisions.map((d) => d.id);
  const [matches, completedMatches, totalMatches] = await Promise.all([
    findAssignedMatches(supabase, divisions),
    countMatches(supabase, divisionIds, 'done'),
    countMatches(supabase, divisionIds, null),
  ]);

  return { matches, completedMatches, totalMatches };
}

/** いまの大会の部。試合は必ず部にぶら下がっているので、大会で絞るときの起点になる。 */
async function findCurrentDivisions(supabase: SupabaseReadClient): Promise<Division[]> {
  const { data: competition, error: competitionError } = await supabase
    .from('competitions')
    .select('id')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (competitionError) throw competitionError;
  if (!competition) return [];

  const { data: divisions, error: divisionsError } = await supabase
    .from('divisions')
    .select('id, name')
    .eq('competition_id', competition.id)
    .limit(MAX_ROWS);
  if (divisionsError) throw divisionsError;

  return divisions ?? [];
}

/**
 * いまの大会の試合の数。`status` を渡すとその状態のものだけ数える。
 *
 * `count: 'exact'` と `head: true` で**行は 1 件も持ち帰らない**（数だけ返る）。
 * 当日は 100 人がこの画面を開くので、全部読んでから長さを数える形にはしない。
 * 一覧ではないので `.limit()` は要らない（読む行が無い）。
 */
async function countMatches(
  supabase: SupabaseReadClient,
  divisionIds: string[],
  status: 'done' | null
): Promise<number> {
  const query = supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .in('division_id', divisionIds);

  const { count, error } = await (status ? query.eq('status', status) : query);
  if (error) throw error;

  return count ?? 0;
}

async function findAssignedMatches(
  supabase: SupabaseReadClient,
  divisions: Division[]
): Promise<CourtsViewMatchRow[]> {
  const divisionNameById = new Map(divisions.map((d) => [d.id, d.name]));

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, court_number, order_in_court, status, max_game_count, division_id, matchup_id')
    .in(
      'division_id',
      divisions.map((d) => d.id)
    )
    .not('court_number', 'is', null)
    .in('status', ['live', 'waiting'])
    .limit(MAX_MATCHES);
  if (matchesError) throw matchesError;
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map((m) => m.id);
  const matchupIds = [...new Set(matches.map((m) => m.matchup_id))];

  const { data: matchups, error: matchupsError } = await supabase
    .from('matchups')
    .select('id, round_name, side_a_team_id, side_b_team_id')
    .in('id', matchupIds)
    .limit(MAX_ROWS);
  if (matchupsError) throw matchupsError;
  const matchupById = new Map((matchups ?? []).map((m) => [m.id, m]));

  const teamIds = [
    ...new Set(
      (matchups ?? [])
        .flatMap((m) => [m.side_a_team_id, m.side_b_team_id])
        .filter((id) => id !== null)
    ),
  ];

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, team_number')
    .in('id', teamIds)
    .limit(MAX_ROWS);
  if (teamsError) throw teamsError;
  const teamNumberById = new Map((teams ?? []).map((t) => [t.id, t.team_number]));

  const { data: matchPlayers, error: matchPlayersError } = await supabase
    .from('match_players')
    .select('match_id, side, participant_id, order_in_pair')
    .in('match_id', matchIds)
    .order('order_in_pair', { ascending: true })
    .limit(MAX_ROWS);
  if (matchPlayersError) throw matchPlayersError;

  const participantIds = [...new Set((matchPlayers ?? []).map((mp) => mp.participant_id))];
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, player_id')
    .in('id', participantIds)
    .limit(MAX_ROWS);
  if (participantsError) throw participantsError;
  const playerIdByParticipantId = new Map((participants ?? []).map((p) => [p.id, p.player_id]));

  const playerIds = [...new Set([...playerIdByParticipantId.values()])];
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name')
    .in('id', playerIds)
    .limit(MAX_ROWS);
  if (playersError) throw playersError;
  const playerNameById = new Map((players ?? []).map((p) => [p.id, p.name]));

  const { data: gameScores, error: gameScoresError } = await supabase
    .from('game_scores')
    .select('match_id, game_number, side_a_score, side_b_score')
    .in('match_id', matchIds)
    .limit(MAX_ROWS);
  if (gameScoresError) throw gameScoresError;

  function playersOfSide(matchId: string, side: 'a' | 'b'): CourtsViewPlayerRow[] {
    return (matchPlayers ?? [])
      .filter((mp) => mp.match_id === matchId && mp.side === side)
      .map((mp) => {
        const playerId = playerIdByParticipantId.get(mp.participant_id) ?? '';
        return { playerId, name: playerNameById.get(playerId) ?? '' };
      });
  }

  /**
   * チームがまだ決まっていない対戦（決勝の空枠など）は null を返す。
   * コートを割り当てられていても出す名前も色も無いので、buildCourtsView がそのコートを飛ばす。
   */
  function teamNumberFor(teamId: string | null | undefined): number | null {
    if (!teamId) return null;
    return teamNumberById.get(teamId) ?? null;
  }

  return matches.map((match) => {
    const matchup = matchupById.get(match.matchup_id);

    return {
      matchId: match.id,
      // .not('court_number', 'is', null) で絞っているので必ず入っている
      courtNumber: match.court_number as number,
      orderInCourt: match.order_in_court ?? 0,
      status: match.status,
      maxGameCount: match.max_game_count,
      divisionName: divisionNameById.get(match.division_id) ?? '',
      roundName: matchup?.round_name ?? '',
      teamA: {
        teamNumber: teamNumberFor(matchup?.side_a_team_id),
        players: playersOfSide(match.id, 'a'),
      },
      teamB: {
        teamNumber: teamNumberFor(matchup?.side_b_team_id),
        players: playersOfSide(match.id, 'b'),
      },
      gameScores: (gameScores ?? [])
        .filter((g) => g.match_id === match.id)
        .map((g) => ({
          gameNumber: g.game_number,
          sideAScore: g.side_a_score,
          sideBScore: g.side_b_score,
        })),
    };
  });
}
