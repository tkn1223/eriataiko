import 'server-only';

import { createSupabaseServerClient } from '@/db/server';
import type {
  CourtsViewDivisionRow,
  CourtsViewMatchRow,
  CourtsViewPlayerRow,
  CourtsViewSideRow,
  CourtsViewStageRow,
} from '@/usecases/build-courts-view';

/**
 * `/courts`（結果LIVE）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 試合まわり（対戦・チーム・出場者・選手名・得点）は、埋め込みの select で **1 回に**まとめて読む。
 * 当日いちばん開かれる画面で、体育館の電波は細い。表ごとに順番に読むと待ち時間が積み重なるため
 * （はじめは 11 回・6 段の順番待ちだった）。いまは大会の id が分かったあと、
 * 部・段・試合まわり・自分の参加者情報の 4 回を同時に読むだけ（`findCurrentCompetitionId` と合わせて 5 回・2 段）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * 100 人・48 試合という大会の規模を踏まえた余裕を持った数にしている
 * （`src/db/me.ts` の MAX_MY_MATCHES と同じ考え方。大会全体の試合数は超えない）。
 * 埋め込んだ表の上限は「試合 1 つあたり」に効く。
 */
const MAX_DIVISIONS = 20;
const MAX_STAGES = 20;
const MAX_MATCHES = 100;
/** ダブルスで 4 人。組み替えの行が残っても切れないよう倍にしておく。 */
const MAX_PLAYERS_PER_MATCH = 8;
/** 決勝でも 3 ゲーム。上限ゲーム数を増やす運用にも耐えるよう余裕を持たせる。 */
const MAX_GAME_SCORES_PER_MATCH = 10;

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

  const [divisions, stages, matches, myParticipantId] = await Promise.all([
    findDivisions(supabase, competitionId),
    findStages(supabase, competitionId),
    findMatches(supabase, competitionId),
    playerId ? findMyParticipantId(supabase, competitionId, playerId) : Promise.resolve(null),
  ]);

  return { myParticipantId, divisions, stages, matches };
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

/**
 * その大会の試合を、対戦・チーム番号・出場者の名前・得点ごと 1 回で読む。
 *
 * 大会で絞るのに `divisions!inner` を使う。matches 自身は大会の id を持たないが、
 * 部は必ず大会に属する（`matches.division_id` は not null）ので、ここを通せば 1 段で絞れる。
 * チームは matchups から 2 本（a 側・b 側）出ているので、外部キーの名前で向きを指定する。
 */
async function findMatches(
  supabase: SupabaseReadClient,
  competitionId: string
): Promise<CourtsViewMatchRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, status, max_game_count, court_number, order_in_court, division_id,
      divisions!inner(competition_id),
      matchups!inner(
        stage_id, round_name, side_a_slot_label, side_b_slot_label,
        side_a_team:teams!matchups_side_a_team_id_fkey(team_number),
        side_b_team:teams!matchups_side_b_team_id_fkey(team_number)
      ),
      match_players(side, participant_id, order_in_pair, participants!inner(players!inner(name))),
      game_scores(game_number, side_a_score, side_b_score)`
    )
    .eq('divisions.competition_id', competitionId)
    .limit(MAX_PLAYERS_PER_MATCH, { referencedTable: 'match_players' })
    .limit(MAX_GAME_SCORES_PER_MATCH, { referencedTable: 'game_scores' })
    .limit(MAX_MATCHES);
  if (error) throw error;

  return (data ?? []).map((match) => {
    const players = match.match_players.map((row) => ({
      side: row.side,
      participantId: row.participant_id,
      orderInPair: row.order_in_pair,
      name: row.participants.players.name,
    }));

    return {
      matchId: match.id,
      status: match.status,
      maxGameCount: match.max_game_count,
      courtNumber: match.court_number,
      orderInCourt: match.order_in_court,
      divisionId: match.division_id,
      stageId: match.matchups.stage_id,
      roundName: match.matchups.round_name,
      sideA: toSideRow(
        match.matchups.side_a_team?.team_number ?? null,
        match.matchups.side_a_slot_label,
        players,
        'a'
      ),
      sideB: toSideRow(
        match.matchups.side_b_team?.team_number ?? null,
        match.matchups.side_b_slot_label,
        players,
        'b'
      ),
      gameScores: match.game_scores.map((row) => ({
        gameNumber: row.game_number,
        sideAScore: row.side_a_score,
        sideBScore: row.side_b_score,
      })),
    };
  });
}

function toSideRow(
  teamNumber: number | null,
  slotLabel: string | null,
  players: (CourtsViewPlayerRow & { side: string })[],
  side: 'a' | 'b'
): CourtsViewSideRow {
  return {
    teamNumber,
    slotLabel,
    players: players
      .filter((p) => p.side === side)
      .map(({ participantId, orderInPair, name }) => ({ participantId, orderInPair, name })),
  };
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
