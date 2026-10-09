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
 * **読み込みは性質の違う 2 種類に分けている。**（PR #56 レビュー）
 * - コートのカード用: 進行中（live）と未実施（waiting）の試合**だけ**を、
 *   対戦・チーム・出場者の名前・得点ごと 1 回で読む。終わった試合は画面に出ないので読まない。
 * - 「◯/◯ 試合消化」用: 段ごとの試合数と終了数を、**件数として数えるだけ**
 *   （埋め込みの `matches(count)` で件数だけを受け取り、試合の行は持ってこない）。中身は要らない。
 * 1 本で兼ねていたころは、終わった試合ぶんだけ大会が進むほど重くなり、
 * 上限（100 件）を超えるとコートや消化数が**黙って**欠けた。
 *
 * 当日いちばん開かれる画面で、体育館の電波は細い。順番待ちの段数を増やさないよう、
 * 大会の id が分かったあと、部・段と段ごとの件数・コート用の試合・自分の参加者情報の 4 回を
 * 同時に読む（`findCurrentCompetitionId` と合わせて 5 回・2 段。段の数が増えても回数は変わらない）。
 *
 * 一覧の上限（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）は、
 * `src/db/snapshot.ts` と同じく**上限より 1 件多く読み**、超えたら `truncated` で分かるようにする
 * （超えた 1 件は判定にだけ使い、渡さない）。
 * 埋め込んだ表の上限は、親の 1 行あたり（試合 1 つ・段 1 つあたり）に効く。
 */
const MAX_DIVISIONS = 20;
const MAX_STAGES = 20;
/**
 * 1 段あたりの対戦の数の上限。チームは 4 つまで（teams_team_number_range）なので、
 * 総当たりでも 1 段に 6 対戦。組み方が変わっても届かないよう大きく取る
 * （1 対戦ぶんは件数 2 つだけの小さな行なので、多めにしても軽い）。
 */
export const MAX_MATCHUPS_PER_STAGE = 100;
/**
 * コート用の試合（live と waiting）の上限。朝は全部が waiting なので、
 * 大会全体の試合数（100 人で 1 人 5 試合 = 125 試合が目安）を超える余裕を持たせる。
 */
export const MAX_COURT_MATCHES = 200;
/**
 * 1 試合の出場者は多くても 4 行（側 a/b × ペアの中の順番 1/2）。
 * 表の `unique (match_id, side, order_in_pair)` が 5 行目を弾くので、この数を超えることはない。
 * 上限そのものは、万一の取り込みミスで黙って切り落とさないための保険として倍にしてある。
 */
const MAX_PLAYERS_PER_MATCH = 8;
/** 決勝でも 3 ゲーム。上限ゲーム数を増やす運用にも耐えるよう余裕を持たせる。 */
const MAX_GAME_SCORES_PER_MATCH = 10;

export type CourtsData = {
  /** 選手として入った人の participants.id。その大会に参加者情報が無ければ null。 */
  myParticipantId: string | null;
  divisions: CourtsViewDivisionRow[];
  /** 段と、段ごとの試合数・終了数（件数だけ）。 */
  stages: CourtsViewStageRow[];
  /** 進行中（live）と未実施（waiting）の試合だけ。 */
  matches: CourtsViewMatchRow[];
  /** どれかの読み込みが上限に達し、読み切れていない。 */
  truncated: boolean;
};

type SupabaseReadClient = ReturnType<typeof createSupabaseServerClient>;

/** 上限 + 1 件まで読んだ行から、上限を超えたかの判定と、上限までの行を取り出す。 */
function withinLimit<Row>(rows: Row[], max: number): { rows: Row[]; overflowed: boolean } {
  return { rows: rows.slice(0, max), overflowed: rows.length > max };
}

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
    findStagesWithCounts(supabase, competitionId),
    findCourtMatches(supabase, competitionId),
    playerId ? findMyParticipantId(supabase, competitionId, playerId) : Promise.resolve(null),
  ]);

  return {
    myParticipantId,
    divisions: divisions.rows,
    stages: stages.rows,
    matches: matches.rows,
    truncated: divisions.overflowed || stages.overflowed || matches.overflowed,
  };
}

/** いまの大会の部すべて（並び順で色を付けるのと、部の名前を出すのに使う）。 */
async function findDivisions(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('divisions')
    .select('id, name, sort_order')
    .eq('competition_id', competitionId)
    .limit(MAX_DIVISIONS + 1);
  if (error) throw error;

  const { rows, overflowed } = withinLimit(data ?? [], MAX_DIVISIONS);
  return {
    rows: rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order })),
    overflowed,
  };
}

/**
 * いまの大会の段すべて（予選リーグ・決勝トーナメントなど）と、段ごとの試合数・終了数。
 *
 * 件数は**数えるだけ**で、試合の行は持ってこない（埋め込みの `matches(count)` は件数だけを返す）。
 * 試合は段を直接持たない（試合 → 対戦 → 段）ので、対戦ごとの件数を受け取って段ごとに足す。
 * 対戦の数は大会の組み方で決まり、試合が進んでも増えない（チームは 4 つまでなので 1 段に数個）。
 *
 * 段の一覧と件数を 1 回で読むのは、段の id を知ってから段ごとに数えると
 * 順番待ちが 1 段増え、問い合わせも段の数 × 2 回増えるため（体育館の電波は細い）。
 */
async function findStagesWithCounts(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, sort_order, matchups(total:matches(count), done:matches(count))')
    .eq('competition_id', competitionId)
    .eq('matchups.done.status', 'done')
    .limit(MAX_MATCHUPS_PER_STAGE + 1, { referencedTable: 'matchups' })
    .limit(MAX_STAGES + 1);
  if (error) throw error;

  const { rows: stageRows, overflowed: stagesOverflowed } = withinLimit(data ?? [], MAX_STAGES);
  let matchupsOverflowed = false;
  const rows: CourtsViewStageRow[] = stageRows.map((row) => {
    const { rows: matchups, overflowed } = withinLimit(row.matchups, MAX_MATCHUPS_PER_STAGE);
    if (overflowed) matchupsOverflowed = true;
    return {
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      totalMatches: sumCounts(matchups.map((matchup) => matchup.total)),
      doneMatches: sumCounts(matchups.map((matchup) => matchup.done)),
    };
  });
  return { rows, overflowed: stagesOverflowed || matchupsOverflowed };
}

/** 対戦ごとの `matches(count)`（`[{ count }]` の形）を足し合わせる。 */
function sumCounts(countsPerMatchup: { count: number }[][]): number {
  return countsPerMatchup.reduce((sum, counts) => sum + (counts[0]?.count ?? 0), 0);
}

/**
 * コートに出す試合（進行中と未実施）を、対戦・チーム番号・出場者の名前・得点ごと 1 回で読む。
 *
 * 大会で絞るのに `divisions!inner` を使う。matches 自身は大会の id を持たないが、
 * 部は必ず大会に属する（`matches.division_id` は not null）ので、ここを通せば 1 段で絞れる。
 * チームは matchups から 2 本（a 側・b 側）出ているので、外部キーの名前で向きを指定する。
 *
 * 上限を超えたとき**どの行が欠けるかが決まっている**よう、コート番号・順番で並べる
 * （欠けるのはコートが未定の試合と、番号の大きいコートのほう）。
 */
async function findCourtMatches(supabase: SupabaseReadClient, competitionId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `id, status, max_game_count, court_number, order_in_court, finished_at, division_id,
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
    .in('status', ['live', 'waiting'])
    .order('court_number', { ascending: true })
    .order('order_in_court', { ascending: true })
    .limit(MAX_PLAYERS_PER_MATCH, { referencedTable: 'match_players' })
    .limit(MAX_GAME_SCORES_PER_MATCH, { referencedTable: 'game_scores' })
    .limit(MAX_COURT_MATCHES + 1);
  if (error) throw error;

  const { rows, overflowed } = withinLimit(data ?? [], MAX_COURT_MATCHES);

  const matches: CourtsViewMatchRow[] = rows.map((match) => {
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
      finishedAt: match.finished_at,
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

  return { rows: matches, overflowed };
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
