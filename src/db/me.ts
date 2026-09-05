import 'server-only';

import { createSupabaseServerClient } from '@/db/server';
import type {
  MyPageViewDivisionRow,
  MyPageViewGameScoreRow,
  MyPageViewMatchRow,
  MyPageViewPlayerRow,
} from '@/usecases/build-my-page-view';

/**
 * `/me`（マイページ）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 表と列がいくつも絡む（matches → matchups、match_players → participants → players）ので、
 * 1 回の入れ子クエリにはせず、素朴に何回かに分けて読んで JS 側で組み立てる
 * （`src/db/courts.ts` / `src/db/matches.ts` と同じ方針）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * 100 人・48 試合という大会の規模を踏まえた余裕を持った数にしている。
 * 自分 1 人が出る試合の数は大会全体の試合数（48）を超えないので、
 * 「自分の試合」がらみの一覧は 100 を上限にしている。
 */
const MAX_MY_MATCHES = 100;
/** 1 試合に出る人数（ダブルスなら 4 人）× 上の上限。人・出場者まわりの一覧の上限。 */
const MAX_PLAYER_ROWS = 400;

export type MyPageData = {
  /** 自分の participants.id。試合の中から自分がどちら側かを見分けるのに使う。 */
  myParticipantId: string;
  profile: {
    name: string;
    teamNumber: number | null;
    teamName: string | null;
    divisionId: string | null;
  };
  divisions: MyPageViewDivisionRow[];
  matches: MyPageViewMatchRow[];
};

type SupabaseReadClient = ReturnType<typeof createSupabaseServerClient>;

/**
 * `/me` が要るものをまとめて読む。
 *
 * いまの大会が無い、またはその大会に自分の参加者情報が無ければ null を返す
 * （呼び出し側が「大会が設定されていません」にあたる日本語を出す）。
 */
export async function findMyPageData(playerId: string): Promise<MyPageData | null> {
  const supabase = createSupabaseServerClient();

  const competitionId = await findCurrentCompetitionId(supabase);
  if (!competitionId) return null;

  const participant = await findMyParticipant(supabase, competitionId, playerId);
  if (!participant) return null;

  const [divisions, matches] = await Promise.all([
    findDivisions(supabase, competitionId),
    findMyMatches(supabase, participant.id),
  ]);

  return {
    myParticipantId: participant.id,
    profile: {
      name: participant.playerName,
      teamNumber: participant.teamNumber,
      teamName: participant.teamName,
      divisionId: participant.divisionId,
    },
    divisions,
    matches,
  };
}

async function findCurrentCompetitionId(supabase: SupabaseReadClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('competitions')
    .select('id')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

type MyParticipant = {
  id: string;
  playerName: string;
  teamNumber: number | null;
  teamName: string | null;
  divisionId: string | null;
};

async function findMyParticipant(
  supabase: SupabaseReadClient,
  competitionId: string,
  playerId: string
): Promise<MyParticipant | null> {
  const { data, error } = await supabase
    .from('participants')
    .select('id, division_id, players!inner(name), teams(team_number, name)')
    .eq('competition_id', competitionId)
    .eq('player_id', playerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    playerName: data.players.name,
    divisionId: data.division_id,
    teamNumber: data.teams?.team_number ?? null,
    teamName: data.teams?.name ?? null,
  };
}

/** いまの大会の部すべて（並び順のラベル付けに使う）。 */
async function findDivisions(
  supabase: SupabaseReadClient,
  competitionId: string
): Promise<MyPageViewDivisionRow[]> {
  // 部の数は運営が決める小さな数（見本は 1部/2部/3部 の 3 つ）なので 20 で十分。
  const MAX_DIVISIONS = 20;
  const { data, error } = await supabase
    .from('divisions')
    .select('id, sort_order')
    .eq('competition_id', competitionId)
    .limit(MAX_DIVISIONS);
  if (error) throw error;

  return (data ?? []).map((row) => ({ id: row.id, sortOrder: row.sort_order }));
}

/** 自分が出る試合を、画面が要る形（対戦相手・得点込み）でまとめて読む。 */
async function findMyMatches(
  supabase: SupabaseReadClient,
  myParticipantId: string
): Promise<MyPageViewMatchRow[]> {
  const matchIds = await findMyMatchIds(supabase, myParticipantId);
  if (matchIds.length === 0) return [];

  const matches = await findMatchesByIds(supabase, matchIds);
  const matchupIds = [...new Set(matches.map((match) => match.matchup_id))];

  const [matchups, matchPlayers, gameScores] = await Promise.all([
    findRoundNamesByMatchupIds(supabase, matchupIds),
    findMatchPlayersByMatchIds(supabase, matchIds),
    findGameScoresByMatchIds(supabase, matchIds),
  ]);

  return matches.map((match) => ({
    matchId: match.id,
    status: match.status,
    maxGameCount: match.max_game_count,
    courtNumber: match.court_number,
    orderInCourt: match.order_in_court,
    divisionId: match.division_id,
    roundName: matchups.get(match.matchup_id) ?? '',
    players: matchPlayers.get(match.id) ?? [],
    gameScores: gameScores.get(match.id) ?? [],
  }));
}

/** 自分が出る試合の id 一覧。match_players を自分の participant_id で絞る。 */
async function findMyMatchIds(
  supabase: SupabaseReadClient,
  myParticipantId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('match_players')
    .select('match_id')
    .eq('participant_id', myParticipantId)
    .limit(MAX_MY_MATCHES);
  if (error) throw error;

  return [...new Set((data ?? []).map((row) => row.match_id))];
}

type MatchRow = {
  id: string;
  status: string;
  max_game_count: number;
  court_number: number | null;
  order_in_court: number | null;
  division_id: string;
  matchup_id: string;
};

async function findMatchesByIds(
  supabase: SupabaseReadClient,
  matchIds: string[]
): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, status, max_game_count, court_number, order_in_court, division_id, matchup_id')
    .in('id', matchIds)
    .limit(MAX_MY_MATCHES);
  if (error) throw error;
  return data ?? [];
}

/** matchup_id → round_name。対戦（matchup）は試合より少ない（1 対戦に複数試合がぶら下がる）ので、
 *  自分の試合数と同じ上限で十分足りる。 */
async function findRoundNamesByMatchupIds(
  supabase: SupabaseReadClient,
  matchupIds: string[]
): Promise<Map<string, string>> {
  if (matchupIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('matchups')
    .select('id, round_name')
    .in('id', matchupIds)
    .limit(MAX_MY_MATCHES);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.id, row.round_name]));
}

/** match_id → その試合に出ている全員（自分も含む、名前込み）。 */
async function findMatchPlayersByMatchIds(
  supabase: SupabaseReadClient,
  matchIds: string[]
): Promise<Map<string, MyPageViewPlayerRow[]>> {
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

  const byMatchId = new Map<string, MyPageViewPlayerRow[]>();
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
): Promise<Map<string, MyPageViewGameScoreRow[]>> {
  // 1 試合のゲーム数は現実的に片手で足りる件数なので、自分の試合数の上限に
  // 少し余裕を持たせた数にしている（src/db/matches.ts の MAX_GAMES_PER_MATCH と同じ考え方）。
  const MAX_GAME_SCORE_ROWS = MAX_MY_MATCHES * 5;
  const { data, error } = await supabase
    .from('game_scores')
    .select('match_id, game_number, side_a_score, side_b_score')
    .in('match_id', matchIds)
    .limit(MAX_GAME_SCORE_ROWS);
  if (error) throw error;

  const byMatchId = new Map<string, MyPageViewGameScoreRow[]>();
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
