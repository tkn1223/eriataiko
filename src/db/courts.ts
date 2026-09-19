import 'server-only';

import { createSupabaseServerClient } from '@/db/server';
import type {
  CourtsViewDivisionRow,
  CourtsViewGameScoreRow,
  CourtsViewMatchRow,
  CourtsViewPlayerRow,
  CourtsViewSideRow,
  CourtsViewStageRow,
} from '@/usecases/build-courts-view';

/**
 * `/courts`（結果LIVE）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * `src/db/me.ts` と同じ考え方で、1 回の入れ子クエリにはせず素朴に何回かに分けて読んで
 * JS 側で組み立てる。表と列がいくつも絡む（matches → matchups → teams、
 * match_players → participants → players）ので、分けたほうが 1 つずつ確かめられる。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * 100 人・48 試合という大会の規模を踏まえた余裕を持った数にしている
 * （`src/db/me.ts` の MAX_MY_MATCHES と同じ考え方。大会全体の試合数は超えない）。
 */
const MAX_DIVISIONS = 20;
const MAX_STAGES = 20;
const MAX_TEAMS = 20;
const MAX_MATCHUPS = 100;
const MAX_MATCHES = 100;
const MAX_PLAYER_ROWS = 400;
const MAX_GAME_SCORE_ROWS = 500;

export type CourtsData = {
  /** 選手として入った人の participants.id。その大会に参加者情報が無ければ null。 */
  myParticipantId: string | null;
  divisions: CourtsViewDivisionRow[];
  stages: CourtsViewStageRow[];
  matches: CourtsViewMatchRow[];
};

type SupabaseReadClient = ReturnType<typeof createSupabaseServerClient>;

/**
 * `/courts` が要るものをまとめて読む。
 *
 * どの大会かは呼び出し側（`page.tsx`）が `findCurrentCompetitionId`（`src/db/me.ts`）で
 * 決めて渡す。`playerId` は選手として入った人の `players.id`。観戦者・未入場は null を渡すと
 * `myParticipantId` は常に null になる（isMine は常に false 扱いになる）。
 */
export async function findCourtsData(
  competitionId: string,
  playerId: string | null
): Promise<CourtsData> {
  const supabase = createSupabaseServerClient();

  // 大会 id だけで読めるものは同時に読む（体育館の細い電波で待ち時間を積み重ねないため）。
  const [divisions, stages, teamNumberByTeamId, myParticipantId] = await Promise.all([
    findDivisions(supabase, competitionId),
    findStages(supabase, competitionId),
    findTeamNumberByTeamId(supabase, competitionId),
    playerId ? findMyParticipantId(supabase, competitionId, playerId) : Promise.resolve(null),
  ]);

  const stageIds = stages.map((s) => s.id);
  const matchups = await findMatchups(supabase, stageIds);

  const matchupIds = matchups.map((m) => m.id);
  const matchRows = await findMatches(supabase, matchupIds);
  const matchIds = matchRows.map((m) => m.id);

  const [matchPlayersByMatchId, gameScoresByMatchId] = await Promise.all([
    findMatchPlayersByMatchIds(supabase, matchIds),
    findGameScoresByMatchIds(supabase, matchIds),
  ]);

  const matchupById = new Map(matchups.map((m) => [m.id, m]));

  const matches: CourtsViewMatchRow[] = matchRows.map((match) => {
    const matchup = matchupById.get(match.matchup_id)!;
    const players = matchPlayersByMatchId.get(match.id) ?? [];

    return {
      matchId: match.id,
      status: match.status,
      maxGameCount: match.max_game_count,
      courtNumber: match.court_number,
      orderInCourt: match.order_in_court,
      divisionId: match.division_id,
      stageId: matchup.stage_id,
      roundName: matchup.round_name,
      sideA: toSideRow(
        matchup.side_a_team_id,
        matchup.side_a_slot_label,
        players,
        'a',
        teamNumberByTeamId
      ),
      sideB: toSideRow(
        matchup.side_b_team_id,
        matchup.side_b_slot_label,
        players,
        'b',
        teamNumberByTeamId
      ),
      gameScores: gameScoresByMatchId.get(match.id) ?? [],
    };
  });

  return { myParticipantId, divisions, stages, matches };
}

function toSideRow(
  teamId: string | null,
  slotLabel: string | null,
  players: (CourtsViewPlayerRow & { side: string })[],
  side: 'a' | 'b',
  teamNumberByTeamId: Map<string, number>
): CourtsViewSideRow {
  return {
    teamNumber: teamId ? (teamNumberByTeamId.get(teamId) ?? null) : null,
    slotLabel,
    players: players
      .filter((p) => p.side === side)
      .map(({ participantId, orderInPair, name }) => ({
        participantId,
        orderInPair,
        name,
      })),
  };
}

/** いまの大会の部すべて（並び順のラベル付けに使う）。 */
async function findDivisions(
  supabase: SupabaseReadClient,
  competitionId: string
): Promise<CourtsViewDivisionRow[]> {
  const { data, error } = await supabase
    .from('divisions')
    .select('id, sort_order')
    .eq('competition_id', competitionId)
    .limit(MAX_DIVISIONS);
  if (error) throw error;

  return (data ?? []).map((row) => ({ id: row.id, sortOrder: row.sort_order }));
}

/** いまの大会の段すべて（予選リーグ・決勝トーナメントなど）。 */
async function findStages(
  supabase: SupabaseReadClient,
  competitionId: string
): Promise<CourtsViewStageRow[]> {
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, sort_order')
    .eq('competition_id', competitionId)
    .limit(MAX_STAGES);
  if (error) throw error;

  return (data ?? []).map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }));
}

type MatchupRow = {
  id: string;
  stage_id: string;
  round_name: string;
  side_a_team_id: string | null;
  side_b_team_id: string | null;
  side_a_slot_label: string | null;
  side_b_slot_label: string | null;
};

/** 段の一覧から、その段にぶら下がる対戦（matchups）を全部読む。 */
async function findMatchups(
  supabase: SupabaseReadClient,
  stageIds: string[]
): Promise<MatchupRow[]> {
  if (stageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matchups')
    .select(
      'id, stage_id, round_name, side_a_team_id, side_b_team_id, side_a_slot_label, side_b_slot_label'
    )
    .in('stage_id', stageIds)
    .limit(MAX_MATCHUPS);
  if (error) throw error;
  return data ?? [];
}

/** team_id → team_number。チーム色を決めるのに使う。 */
async function findTeamNumberByTeamId(
  supabase: SupabaseReadClient,
  competitionId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, team_number')
    .eq('competition_id', competitionId)
    .limit(MAX_TEAMS);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, row.team_number]));
}

type MatchRow = {
  id: string;
  matchup_id: string;
  status: string;
  max_game_count: number;
  court_number: number | null;
  order_in_court: number | null;
  division_id: string;
};

async function findMatches(
  supabase: SupabaseReadClient,
  matchupIds: string[]
): Promise<MatchRow[]> {
  if (matchupIds.length === 0) return [];

  const { data, error } = await supabase
    .from('matches')
    .select('id, matchup_id, status, max_game_count, court_number, order_in_court, division_id')
    .in('matchup_id', matchupIds)
    .limit(MAX_MATCHES);
  if (error) throw error;
  return data ?? [];
}

/** match_id → その試合に出ている全員（side 込み、名前込み）。 */
async function findMatchPlayersByMatchIds(
  supabase: SupabaseReadClient,
  matchIds: string[]
): Promise<Map<string, (CourtsViewPlayerRow & { side: string })[]>> {
  if (matchIds.length === 0) return new Map();

  const { data: matchPlayers, error: matchPlayersError } = await supabase
    .from('match_players')
    .select('match_id, side, participant_id, order_in_pair')
    .in('match_id', matchIds)
    .limit(MAX_PLAYER_ROWS);
  if (matchPlayersError) throw matchPlayersError;
  if (!matchPlayers || matchPlayers.length === 0) return new Map();

  const participantIds = [...new Set(matchPlayers.map((row) => row.participant_id))];
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, player_id')
    .in('id', participantIds)
    .limit(MAX_PLAYER_ROWS);
  if (participantsError) throw participantsError;

  const playerIdByParticipantId = new Map(
    (participants ?? []).map((row) => [row.id, row.player_id])
  );
  const playerIds = [...new Set([...playerIdByParticipantId.values()])];

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, name')
    .in('id', playerIds)
    .limit(MAX_PLAYER_ROWS);
  if (playersError) throw playersError;

  const playerNameById = new Map((players ?? []).map((row) => [row.id, row.name]));

  const byMatchId = new Map<string, (CourtsViewPlayerRow & { side: string })[]>();
  for (const row of matchPlayers) {
    const list = byMatchId.get(row.match_id) ?? [];
    const playerId = playerIdByParticipantId.get(row.participant_id) ?? '';
    list.push({
      participantId: row.participant_id,
      side: row.side === 'b' ? 'b' : 'a',
      orderInPair: row.order_in_pair,
      name: playerNameById.get(playerId) ?? '',
    });
    byMatchId.set(row.match_id, list);
  }
  return byMatchId;
}

async function findGameScoresByMatchIds(
  supabase: SupabaseReadClient,
  matchIds: string[]
): Promise<Map<string, CourtsViewGameScoreRow[]>> {
  if (matchIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('game_scores')
    .select('match_id, game_number, side_a_score, side_b_score')
    .in('match_id', matchIds)
    .limit(MAX_GAME_SCORE_ROWS);
  if (error) throw error;

  const byMatchId = new Map<string, CourtsViewGameScoreRow[]>();
  for (const row of data ?? []) {
    const list = byMatchId.get(row.match_id) ?? [];
    list.push({
      gameNumber: row.game_number,
      sideAScore: row.side_a_score,
      sideBScore: row.side_b_score,
    });
    byMatchId.set(row.match_id, list);
  }
  return byMatchId;
}

/** その大会でのその人の participants.id。参加者情報が無ければ null。 */
async function findMyParticipantId(
  supabase: SupabaseReadClient,
  competitionId: string,
  playerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('participants')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('player_id', playerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
