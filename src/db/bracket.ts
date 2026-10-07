import 'server-only';

import { createSupabaseServerClient } from '@/db/server';
import type {
  BracketViewDivisionRow,
  BracketViewInput,
  BracketViewMatchupRow,
  BracketViewTeamRow,
} from '@/usecases/build-bracket-view';

/**
 * `/bracket`（対戦表）が読む DB の行。**読み取りだけ**（`createSupabaseServerClient()`）。
 *
 * 大会の id が分かったあと、部・チーム・段ごとの対戦（中の試合・出場者・得点つき）・
 * 自分のチームの 4 回を**同時に**読む（呼び出し側が先に大会を 1 回読むので、合わせて 5 回・2 段。
 * 体育館の電波は細いので、順番待ちの段数を増やさない。`src/db/courts.ts` と同じ考え方）。
 *
 * 対戦と試合は「段 → 対戦 → 試合 → 出場者・得点」を 1 回で読む。予選と決勝を分けて読むと
 * 回数が増えるうえ、両方とも同じ形（対戦の中の試合の勝敗）で使うため。
 * 開いたときに 1 回だけ読み、自動では読み直さない（1-c の宿題）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * `src/db/snapshot.ts`・`src/db/courts.ts` と同じく**上限より 1 件多く読み**、超えたら
 * `truncated` で分かるようにする（超えた 1 件は判定にだけ使い、渡さない）。
 * 埋め込んだ表の上限は、親の 1 行あたり（段 1 つ・対戦 1 つ・試合 1 つあたり）に効く。
 * 上限を超えたとき**どの行が欠けるかが決まっている**よう、並べてから切る。
 */
const MAX_DIVISIONS = 20;
const MAX_TEAMS = 10;
const MAX_STAGES = 20;
/**
 * 1 段あたりの対戦の数の上限。チームは 4 つまで（teams_team_number_range）なので、
 * 総当たりでも 1 段に 6 対戦。組み方が変わっても届かないよう大きく取る。
 */
export const MAX_MATCHUPS_PER_STAGE = 100;
/** 1 対戦あたりの試合の数の上限。部ごとに 1 試合なので、部の数（色は 6 部まで）に余裕を持たせる。 */
export const MAX_MATCHES_PER_MATCHUP = 20;
/**
 * 1 試合の出場者は多くても 4 行（側 a/b × ペアの中の順番 1/2）。
 * 表の `unique (match_id, side, order_in_pair)` が 5 行目を弾くので、この数を超えることはない。
 * 上限そのものは、万一の取り込みミスで黙って切り落とさないための保険として倍にしてある。
 */
const MAX_PLAYERS_PER_MATCH = 8;
/** 決勝でも 3 ゲーム。上限ゲーム数を増やす運用にも耐えるよう余裕を持たせる。 */
const MAX_GAME_SCORES_PER_MATCH = 10;

type SupabaseReadClient = ReturnType<typeof createSupabaseServerClient>;

/** 上限 + 1 件まで読んだ行から、上限を超えたかの判定と、上限までの行を取り出す。 */
function withinLimit<Row>(rows: Row[], max: number): { rows: Row[]; overflowed: boolean } {
  return { rows: rows.slice(0, max), overflowed: rows.length > max };
}

/**
 * `/bracket` が要るものをまとめて読む。
 *
 * どの大会かは呼び出し側（`page.tsx` → `loadBracketPage`）が `findCurrentCompetition`
 * （`src/db/competition.ts`）で決めて渡す。`playerId` は選手として入った人の `players.id`。
 * 観戦者・未入場は null を渡すと `myTeamId` は常に null になる（自分のチームの印が付かない）。
 */
export async function findBracketData(
  competitionId: string,
  playerId: string | null
): Promise<BracketViewInput> {
  const supabase = createSupabaseServerClient();

  const [divisions, teams, matchups, myTeamId] = await Promise.all([
    findDivisions(supabase, competitionId),
    findTeams(supabase, competitionId),
    findMatchups(supabase, competitionId),
    playerId ? findMyTeamId(supabase, competitionId, playerId) : Promise.resolve(null),
  ]);

  return {
    myTeamId,
    divisions: divisions.rows,
    teams: teams.rows,
    matchups: matchups.rows,
    truncated: divisions.overflowed || teams.overflowed || matchups.overflowed,
  };
}

/** いまの大会の部すべて（並び順で色を付けるのと、部の名前を出すのに使う）。 */
async function findDivisions(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('divisions')
    .select('id, name, sort_order')
    .eq('competition_id', competitionId)
    .order('sort_order', { ascending: true })
    .limit(MAX_DIVISIONS + 1);
  if (error) throw error;

  const { rows, overflowed } = withinLimit(data ?? [], MAX_DIVISIONS);
  const divisions: BracketViewDivisionRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  }));
  return { rows: divisions, overflowed };
}

/** いまの大会のチームすべて（星取表の行・列の順に並べる）。 */
async function findTeams(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('id, team_number, name, sort_order')
    .eq('competition_id', competitionId)
    .order('sort_order', { ascending: true })
    .order('team_number', { ascending: true })
    .limit(MAX_TEAMS + 1);
  if (error) throw error;

  const { rows, overflowed } = withinLimit(data ?? [], MAX_TEAMS);
  const teams: BracketViewTeamRow[] = rows.map((row) => ({
    id: row.id,
    teamNumber: row.team_number,
    name: row.name,
    sortOrder: row.sort_order,
  }));
  return { rows: teams, overflowed };
}

/**
 * いまの大会の対戦すべて（予選・決勝の両方）を、中の試合・出場者・得点ごと 1 回で読む。
 *
 * 出場者の名前は `participants → players` をたどる。決勝の試合のように出場者が
 * まだ入っていない試合は、出場者が空の一覧になる（読めないのではない）。
 * 段の種類（`stages.format`）と並びは対戦の行に写して、フラットな一覧で返す。
 */
async function findMatchups(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('stages')
    .select(
      `id, format, sort_order,
      matchups(
        id, round_name, sort_order,
        side_a_team_id, side_b_team_id, side_a_slot_label, side_b_slot_label,
        matches(
          id, status, max_game_count, division_id, order_in_matchup,
          match_players(side, order_in_pair, participants!inner(players!inner(name))),
          game_scores(game_number, side_a_score, side_b_score)
        )
      )`
    )
    .eq('competition_id', competitionId)
    .order('sort_order', { ascending: true })
    .order('sort_order', { ascending: true, referencedTable: 'matchups' })
    .order('order_in_matchup', { ascending: true, referencedTable: 'matchups.matches' })
    .order('game_number', { ascending: true, referencedTable: 'matchups.matches.game_scores' })
    // 上限で切れるときに欠ける行を決まった順にしておく（側 a → b、ペアの中の順番）
    .order('side', { ascending: true, referencedTable: 'matchups.matches.match_players' })
    .order('order_in_pair', { ascending: true, referencedTable: 'matchups.matches.match_players' })
    .limit(MAX_MATCHUPS_PER_STAGE + 1, { referencedTable: 'matchups' })
    .limit(MAX_MATCHES_PER_MATCHUP + 1, { referencedTable: 'matchups.matches' })
    .limit(MAX_PLAYERS_PER_MATCH + 1, { referencedTable: 'matchups.matches.match_players' })
    .limit(MAX_GAME_SCORES_PER_MATCH + 1, { referencedTable: 'matchups.matches.game_scores' })
    .limit(MAX_STAGES + 1);
  if (error) throw error;

  const stages = withinLimit(data ?? [], MAX_STAGES);
  let overflowed = stages.overflowed;
  const rows: BracketViewMatchupRow[] = [];

  for (const stage of stages.rows) {
    const matchups = withinLimit(stage.matchups, MAX_MATCHUPS_PER_STAGE);
    if (matchups.overflowed) overflowed = true;

    for (const matchup of matchups.rows) {
      const matches = withinLimit(matchup.matches, MAX_MATCHES_PER_MATCHUP);
      if (matches.overflowed) overflowed = true;

      rows.push({
        id: matchup.id,
        stageFormat: stage.format,
        stageSortOrder: stage.sort_order,
        roundName: matchup.round_name,
        sortOrder: matchup.sort_order,
        sideATeamId: matchup.side_a_team_id,
        sideBTeamId: matchup.side_b_team_id,
        sideASlotLabel: matchup.side_a_slot_label,
        sideBSlotLabel: matchup.side_b_slot_label,
        matches: matches.rows.map((match) => {
          const players = withinLimit(match.match_players, MAX_PLAYERS_PER_MATCH);
          const gameScores = withinLimit(match.game_scores, MAX_GAME_SCORES_PER_MATCH);
          if (players.overflowed || gameScores.overflowed) overflowed = true;

          return {
            id: match.id,
            status: match.status,
            maxGameCount: match.max_game_count,
            divisionId: match.division_id,
            orderInMatchup: match.order_in_matchup,
            players: players.rows.map((row) => ({
              side: row.side,
              orderInPair: row.order_in_pair,
              name: row.participants.players.name,
            })),
            gameScores: gameScores.rows.map((row) => ({
              gameNumber: row.game_number,
              sideAScore: row.side_a_score,
              sideBScore: row.side_b_score,
            })),
          };
        }),
      });
    }
  }

  return { rows, overflowed };
}

/**
 * その大会でのその人のチーム（`teams.id`）。参加者情報が無い、またはチームに入っていない
 * （試合に出ない入力係）なら null。
 */
async function findMyTeamId(
  supabase: SupabaseReadClient,
  competitionId: string,
  playerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('participants')
    .select('team_id')
    .eq('competition_id', competitionId)
    .eq('player_id', playerId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.team_id ?? null;
}
