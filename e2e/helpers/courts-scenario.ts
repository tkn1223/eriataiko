import { createClient } from '@supabase/supabase-js';
import { loadTestEnv } from '../../tests/load-env.mjs';
import type { Database } from '@/types/database';

/**
 * /courts（結果LIVE）の画面確認に使う試合を、手元のデータベースに用意する。
 *
 * 前は見本データ（`src/ui/courts/sample-data.ts`）が 8 面ぶんの状態
 * （進行中・0対0・同点・長い名前・呼出待ち…）を固定で持っていたが、DB につないだいまは
 * 本物のデータが要る。`e2e/helpers/long-name-player.ts`（#53）と同じやり方で、
 * いまの大会（`supabase/seed.sql` の固定 id）にテスト用の対戦・試合・選手・得点を
 * service_role で作り、終わったら消す。
 *
 * **2 段階に分けている。**
 * - `createCourtsBaseScenario` … 予選リーグの試合だけを作る。ファイル全体で 1 回だけ作り、
 *   最後まで残す（`test.beforeAll` / `test.afterAll`）。決勝トーナメントの対戦
 *   （相手がまだ決まっていない側の空枠ラベルを確かめる分）は status='waiting' のまま置く。
 *   waiting のうちは「いまの段」を切り替えない（仕様の「決めたこと」2）ので、
 *   ファイル全体で「予選リーグ」のまま確かめられる。
 * - `createFinalScenario` … 決勝トーナメントの試合を status='live' で作る。**これを作ると
 *   「いまの段」が決勝トーナメントに切り替わり、ファイル全体の見え方が変わってしまう**ので、
 *   段の切り替えそのものを確かめる `describe` だけで作って、その中だけで消す
 *   （基本シナリオとは別に beforeAll/afterAll を持つ）。
 */

const env = loadTestEnv();
const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// seed.sql の固定 id（大会・段・チーム・部）。
const COMPETITION_ID = 'c0000000-0000-4000-8000-000000000001';
const LEAGUE_STAGE_ID = '50000000-0000-4000-8000-000000000001';
const KNOCKOUT_STAGE_ID = '50000000-0000-4000-8000-000000000002';
const TEAM_AINAN_ID = '40000000-0000-4000-8000-000000000001'; // 愛知南
const TEAM_AIHOKU_ID = '40000000-0000-4000-8000-000000000003'; // 愛知北
const TEAM_AISEI_ID = '40000000-0000-4000-8000-000000000004'; // 愛知西
const DIVISION_1_ID = 'd0000000-0000-4000-8000-000000000001'; // 1部
const DIVISION_2_ID = 'd0000000-0000-4000-8000-000000000002'; // 2部
const DIVISION_3_ID = 'd0000000-0000-4000-8000-000000000003'; // 3部

// ---------------------------------------------------------------------
// 基本シナリオ（予選リーグだけ。ファイル全体で 1 回作って最後まで残す）
// ---------------------------------------------------------------------

/** seed.sql（1〜16, 99）とも長い名前のテスト（899801〜）とも db テスト（899901〜）ともぶつからない番号。 */
const BASE_PLAYER_NUMBERS = [
  899951, 899952, 899953, 899954, 899955, 899956, 899957, 899958, 899959, 899960,
] as const;
const [
  SCORE_A1,
  SCORE_A2,
  SCORE_B1,
  SCORE_B2,
  SLOT_A1,
  SLOT_A2,
  LONG_A1,
  LONG_A2,
  LONG_B1,
  LONG_B2,
] = BASE_PLAYER_NUMBERS;

/** 対戦（matchups）を後片付けで見分けるための sort_order。seed（10〜60）とはぶつからない。 */
const BASE_SORT_ORDERS = [970, 971, 972, 973] as const;
const [
  SCORE_MATCHUP_SORT_ORDER,
  ZERO_SCORE_MATCHUP_SORT_ORDER,
  SLOT_MATCHUP_SORT_ORDER,
  LONG_NAME_MATCHUP_SORT_ORDER,
] = BASE_SORT_ORDERS;

/** 「＋」「−」の一般的な動作確認に使うコート。得点の入った状態（2-0）から始まる。 */
export const SCORE_COURT_NUMBER = 2;
/** 0対0のまま。「まだ点が入っていません」の確認に使うコート。 */
export const ZERO_SCORE_COURT_NUMBER = 3;
/** 相手がまだ決まっていない対戦（空枠ラベル）を「呼出待ち」で確認するコート。 */
export const SLOT_LABEL_COURT_NUMBER = 5;
/** 進行中も次も無い、素の「予定なし」を確認するコート（このシナリオでは何も作らない）。 */
export const EMPTY_COURT_NUMBER = 6;
/**
 * 空白入りの長い名前どうしの試合（進行中と、同じ顔ぶれの次の試合）。
 * seed の名前は「さとう」など短いものばかりで、**狭い画面で崩れるのは長い名前のとき**
 * （myページで「とペア」が切れる崩れを実際に見つけた。e2e/helpers/long-name-player.ts）。
 * 名簿には半角空白の名前も全角空白の名前もあるので、両方を混ぜる。
 * 枠 3 つに 2 桁の得点を入れ、いちばん詰まった形で 375px を実測する。
 */
export const LONG_NAME_COURT_NUMBER = 7;

export const SCORE_TEAM_A_NAMES = ['関口', '橋本'];
export const SCORE_TEAM_B_NAMES = ['村上', '福田'];
export const SLOT_TEAM_A_NAMES = ['中島', '前田'];
export const SLOT_LABEL_TEXT = '予選4位';
export const LONG_TEAM_A_NAMES = ['五十嵐　十四郎', '長谷川 一二三'];
export const LONG_TEAM_B_NAMES = ['佐々木 太郎', '小早川　日下部'];

/** 基本シナリオが作る予選リーグの試合数（seed の 3 試合 + ここで足す 4 試合）。 */
export const BASE_LEAGUE_TOTAL_MATCHES = 7;
/** 基本シナリオの間、終わっている予選リーグの試合数（seed の 1 試合のまま）。 */
export const BASE_LEAGUE_COMPLETED_MATCHES = 1;

/**
 * 予選リーグの試合と、決勝トーナメントの「相手がまだ決まっていない」対戦を作る。
 * 前回の後片付けが済んでいなくても動くよう、作る前に必ず消してから作る。
 */
export async function createCourtsBaseScenario(): Promise<void> {
  await deleteCourtsBaseScenario();

  const players = await admin
    .from('players')
    .insert([
      { player_number: SCORE_A1, name: SCORE_TEAM_A_NAMES[0] },
      { player_number: SCORE_A2, name: SCORE_TEAM_A_NAMES[1] },
      { player_number: SCORE_B1, name: SCORE_TEAM_B_NAMES[0] },
      { player_number: SCORE_B2, name: SCORE_TEAM_B_NAMES[1] },
      { player_number: SLOT_A1, name: SLOT_TEAM_A_NAMES[0] },
      { player_number: SLOT_A2, name: SLOT_TEAM_A_NAMES[1] },
      { player_number: LONG_A1, name: LONG_TEAM_A_NAMES[0] },
      { player_number: LONG_A2, name: LONG_TEAM_A_NAMES[1] },
      { player_number: LONG_B1, name: LONG_TEAM_B_NAMES[0] },
      { player_number: LONG_B2, name: LONG_TEAM_B_NAMES[1] },
    ])
    .select('id, player_number');
  if (players.error) throw new Error(`選手を作れませんでした: ${players.error.message}`);
  const playerIdByNumber = new Map(players.data.map((row) => [row.player_number, row.id]));

  const participants = await admin
    .from('participants')
    .insert(
      BASE_PLAYER_NUMBERS.map((playerNumber) => ({
        competition_id: COMPETITION_ID,
        player_id: playerIdByNumber.get(playerNumber)!,
        team_id: ([SCORE_A1, SCORE_A2, LONG_A1, LONG_A2] as number[]).includes(playerNumber)
          ? TEAM_AIHOKU_ID
          : ([SCORE_B1, SCORE_B2, LONG_B1, LONG_B2] as number[]).includes(playerNumber)
            ? TEAM_AISEI_ID
            : TEAM_AINAN_ID,
      }))
    )
    .select('id, player_id');
  if (participants.error)
    throw new Error(`参加者を作れませんでした: ${participants.error.message}`);
  const participantIdByPlayerId = new Map(participants.data.map((row) => [row.player_id, row.id]));
  const participantOf = (playerNumber: number) =>
    participantIdByPlayerId.get(playerIdByNumber.get(playerNumber)!)!;

  const matchups = await admin
    .from('matchups')
    .insert([
      {
        stage_id: LEAGUE_STAGE_ID,
        round_name: '予選 4回戦',
        side_a_team_id: TEAM_AIHOKU_ID,
        side_b_team_id: TEAM_AISEI_ID,
        sort_order: SCORE_MATCHUP_SORT_ORDER,
      },
      {
        stage_id: LEAGUE_STAGE_ID,
        round_name: '予選 5回戦',
        side_a_team_id: TEAM_AIHOKU_ID,
        side_b_team_id: TEAM_AISEI_ID,
        sort_order: ZERO_SCORE_MATCHUP_SORT_ORDER,
      },
      {
        stage_id: KNOCKOUT_STAGE_ID,
        round_name: '準決勝3',
        side_a_team_id: TEAM_AINAN_ID,
        side_b_slot_label: SLOT_LABEL_TEXT,
        sort_order: SLOT_MATCHUP_SORT_ORDER,
      },
      {
        stage_id: LEAGUE_STAGE_ID,
        round_name: '予選 6回戦',
        side_a_team_id: TEAM_AIHOKU_ID,
        side_b_team_id: TEAM_AISEI_ID,
        sort_order: LONG_NAME_MATCHUP_SORT_ORDER,
      },
    ])
    .select('id, sort_order');
  if (matchups.error) throw new Error(`対戦を作れませんでした: ${matchups.error.message}`);
  const matchupIdBySortOrder = new Map(matchups.data.map((row) => [row.sort_order, row.id]));

  const matches = await admin
    .from('matches')
    .insert([
      {
        matchup_id: matchupIdBySortOrder.get(SCORE_MATCHUP_SORT_ORDER)!,
        division_id: DIVISION_1_ID,
        order_in_matchup: 1,
        status: 'live',
        max_game_count: 1,
        court_number: SCORE_COURT_NUMBER,
        order_in_court: 1,
      },
      {
        matchup_id: matchupIdBySortOrder.get(ZERO_SCORE_MATCHUP_SORT_ORDER)!,
        division_id: DIVISION_1_ID,
        order_in_matchup: 1,
        status: 'live',
        max_game_count: 1,
        court_number: ZERO_SCORE_COURT_NUMBER,
        order_in_court: 1,
      },
      {
        matchup_id: matchupIdBySortOrder.get(SLOT_MATCHUP_SORT_ORDER)!,
        division_id: DIVISION_2_ID,
        order_in_matchup: 1,
        status: 'waiting',
        max_game_count: 3,
        court_number: SLOT_LABEL_COURT_NUMBER,
        order_in_court: 1,
      },
      {
        matchup_id: matchupIdBySortOrder.get(LONG_NAME_MATCHUP_SORT_ORDER)!,
        division_id: DIVISION_3_ID,
        order_in_matchup: 1,
        status: 'live',
        max_game_count: 3,
        court_number: LONG_NAME_COURT_NUMBER,
        order_in_court: 1,
      },
      {
        matchup_id: matchupIdBySortOrder.get(LONG_NAME_MATCHUP_SORT_ORDER)!,
        division_id: DIVISION_3_ID,
        order_in_matchup: 2,
        status: 'waiting',
        max_game_count: 3,
        court_number: LONG_NAME_COURT_NUMBER,
        order_in_court: 2,
      },
    ])
    .select('id, matchup_id, order_in_matchup');
  if (matches.error) throw new Error(`試合を作れませんでした: ${matches.error.message}`);
  const scoreMatchId = matches.data.find(
    (m) => m.matchup_id === matchupIdBySortOrder.get(SCORE_MATCHUP_SORT_ORDER)
  )!.id;
  const zeroScoreMatchId = matches.data.find(
    (m) => m.matchup_id === matchupIdBySortOrder.get(ZERO_SCORE_MATCHUP_SORT_ORDER)
  )!.id;
  const slotMatchId = matches.data.find(
    (m) => m.matchup_id === matchupIdBySortOrder.get(SLOT_MATCHUP_SORT_ORDER)
  )!.id;
  const longNameMatchIds = matches.data
    .filter((m) => m.matchup_id === matchupIdBySortOrder.get(LONG_NAME_MATCHUP_SORT_ORDER))
    .sort((a, b) => a.order_in_matchup - b.order_in_matchup)
    .map((m) => m.id);
  const [longNameLiveMatchId] = longNameMatchIds;

  const matchPlayers = await admin.from('match_players').insert([
    {
      match_id: scoreMatchId,
      side: 'a',
      participant_id: participantOf(SCORE_A1),
      order_in_pair: 1,
    },
    {
      match_id: scoreMatchId,
      side: 'a',
      participant_id: participantOf(SCORE_A2),
      order_in_pair: 2,
    },
    {
      match_id: scoreMatchId,
      side: 'b',
      participant_id: participantOf(SCORE_B1),
      order_in_pair: 1,
    },
    {
      match_id: scoreMatchId,
      side: 'b',
      participant_id: participantOf(SCORE_B2),
      order_in_pair: 2,
    },
    {
      match_id: zeroScoreMatchId,
      side: 'a',
      participant_id: participantOf(SCORE_A1),
      order_in_pair: 1,
    },
    {
      match_id: zeroScoreMatchId,
      side: 'a',
      participant_id: participantOf(SCORE_A2),
      order_in_pair: 2,
    },
    {
      match_id: zeroScoreMatchId,
      side: 'b',
      participant_id: participantOf(SCORE_B1),
      order_in_pair: 1,
    },
    {
      match_id: zeroScoreMatchId,
      side: 'b',
      participant_id: participantOf(SCORE_B2),
      order_in_pair: 2,
    },
    // slotMatchId は side b（相手）がまだ決まっていないので、a だけ入れる。
    { match_id: slotMatchId, side: 'a', participant_id: participantOf(SLOT_A1), order_in_pair: 1 },
    { match_id: slotMatchId, side: 'a', participant_id: participantOf(SLOT_A2), order_in_pair: 2 },
    // 長い名前の試合は、進行中と次の両方に同じ 4 人を入れる（「次」の行の崩れも見るため）。
    ...longNameMatchIds.flatMap((matchId) => [
      { match_id: matchId, side: 'a', participant_id: participantOf(LONG_A1), order_in_pair: 1 },
      { match_id: matchId, side: 'a', participant_id: participantOf(LONG_A2), order_in_pair: 2 },
      { match_id: matchId, side: 'b', participant_id: participantOf(LONG_B1), order_in_pair: 1 },
      { match_id: matchId, side: 'b', participant_id: participantOf(LONG_B2), order_in_pair: 2 },
    ]),
  ]);
  if (matchPlayers.error)
    throw new Error(`出場者を作れませんでした: ${matchPlayers.error.message}`);

  const gameScores = await admin.from('game_scores').insert([
    { match_id: scoreMatchId, game_number: 1, side_a_score: 2, side_b_score: 0 },
    { match_id: longNameLiveMatchId, game_number: 1, side_a_score: 21, side_b_score: 19 },
    { match_id: longNameLiveMatchId, game_number: 2, side_a_score: 18, side_b_score: 21 },
    { match_id: longNameLiveMatchId, game_number: 3, side_a_score: 20, side_b_score: 20 },
  ]);
  if (gameScores.error) throw new Error(`得点を作れませんでした: ${gameScores.error.message}`);
}

/** 基本シナリオが作ったものを消す。対戦を消せば試合・出場者・得点も、選手を消せば参加も一緒に消える。 */
export async function deleteCourtsBaseScenario(): Promise<void> {
  const matchups = await admin
    .from('matchups')
    .delete()
    .in('stage_id', [LEAGUE_STAGE_ID, KNOCKOUT_STAGE_ID])
    .in('sort_order', BASE_SORT_ORDERS);
  if (matchups.error) throw new Error(`後片付けに失敗（対戦）: ${matchups.error.message}`);

  const players = await admin.from('players').delete().in('player_number', BASE_PLAYER_NUMBERS);
  if (players.error) throw new Error(`後片付けに失敗（選手）: ${players.error.message}`);
}

// ---------------------------------------------------------------------
// 決勝シナリオ（決勝トーナメントを 1 試合だけ start する。「いまの段」の切り替えを確かめる用）
// ---------------------------------------------------------------------

const FINAL_PLAYER_NUMBERS = [899961, 899962, 899963, 899964] as const;
const [FINAL_A1, FINAL_A2, FINAL_B1, FINAL_B2] = FINAL_PLAYER_NUMBERS;
const FINAL_MATCHUP_SORT_ORDER = 980;

/** 決勝トーナメントの試合を確かめるコート。長い名字どうしのペアにしてあるのは、
 * 確認画面と得点の行がいちばん狭くなる場合を 375px で実測するため（e2e/courts.spec.ts）。 */
export const FINAL_COURT_NUMBER = 4;
export const FINAL_TEAM_A_NAMES = ['長谷川', '五十嵐'];
export const FINAL_TEAM_B_NAMES = ['小早川', '日下部'];
export const FINAL_ROUND_NAME = '決勝トーナメント 準決勝';

/**
 * 基本シナリオが作る予選リーグの試合数 + このシナリオが作る決勝トーナメントの試合数。
 * 決勝トーナメントが「いまの段」になっている間の分母（seed の 3 試合 + 基本シナリオの
 * 空枠 1 試合 + ここで作る 1 試合）。
 */
export const FINAL_KNOCKOUT_TOTAL_MATCHES = 5;
export const FINAL_KNOCKOUT_COMPLETED_MATCHES = 0;

/**
 * 決勝トーナメントの試合を 1 つ、1-1 の同点（3 ゲーム先取2本）で作る。
 * status='live' なので、作った瞬間から「いまの段」が決勝トーナメントに切り替わる。
 * 段の切り替えを確かめる describe の中だけで作り、その中だけで消す。
 */
export async function createFinalScenario(): Promise<void> {
  await deleteFinalScenario();

  const players = await admin
    .from('players')
    .insert([
      { player_number: FINAL_A1, name: FINAL_TEAM_A_NAMES[0] },
      { player_number: FINAL_A2, name: FINAL_TEAM_A_NAMES[1] },
      { player_number: FINAL_B1, name: FINAL_TEAM_B_NAMES[0] },
      { player_number: FINAL_B2, name: FINAL_TEAM_B_NAMES[1] },
    ])
    .select('id, player_number');
  if (players.error) throw new Error(`選手を作れませんでした: ${players.error.message}`);
  const playerIdByNumber = new Map(players.data.map((row) => [row.player_number, row.id]));

  const participants = await admin
    .from('participants')
    .insert(
      FINAL_PLAYER_NUMBERS.map((playerNumber) => ({
        competition_id: COMPETITION_ID,
        player_id: playerIdByNumber.get(playerNumber)!,
        team_id: ([FINAL_A1, FINAL_A2] as number[]).includes(playerNumber)
          ? TEAM_AIHOKU_ID
          : TEAM_AISEI_ID,
      }))
    )
    .select('id, player_id');
  if (participants.error)
    throw new Error(`参加者を作れませんでした: ${participants.error.message}`);
  const participantIdByPlayerId = new Map(participants.data.map((row) => [row.player_id, row.id]));
  const participantOf = (playerNumber: number) =>
    participantIdByPlayerId.get(playerIdByNumber.get(playerNumber)!)!;

  const matchup = await admin
    .from('matchups')
    .insert({
      stage_id: KNOCKOUT_STAGE_ID,
      round_name: FINAL_ROUND_NAME,
      side_a_team_id: TEAM_AIHOKU_ID,
      side_b_team_id: TEAM_AISEI_ID,
      sort_order: FINAL_MATCHUP_SORT_ORDER,
    })
    .select('id')
    .single();
  if (matchup.error) throw new Error(`対戦を作れませんでした: ${matchup.error.message}`);

  const match = await admin
    .from('matches')
    .insert({
      matchup_id: matchup.data.id,
      division_id: DIVISION_3_ID,
      order_in_matchup: 1,
      status: 'live',
      max_game_count: 3,
      court_number: FINAL_COURT_NUMBER,
      order_in_court: 1,
    })
    .select('id')
    .single();
  if (match.error) throw new Error(`試合を作れませんでした: ${match.error.message}`);

  const matchPlayers = await admin.from('match_players').insert([
    {
      match_id: match.data.id,
      side: 'a',
      participant_id: participantOf(FINAL_A1),
      order_in_pair: 1,
    },
    {
      match_id: match.data.id,
      side: 'a',
      participant_id: participantOf(FINAL_A2),
      order_in_pair: 2,
    },
    {
      match_id: match.data.id,
      side: 'b',
      participant_id: participantOf(FINAL_B1),
      order_in_pair: 1,
    },
    {
      match_id: match.data.id,
      side: 'b',
      participant_id: participantOf(FINAL_B2),
      order_in_pair: 2,
    },
  ]);
  if (matchPlayers.error)
    throw new Error(`出場者を作れませんでした: ${matchPlayers.error.message}`);

  const gameScores = await admin.from('game_scores').insert([
    { match_id: match.data.id, game_number: 1, side_a_score: 21, side_b_score: 19 },
    { match_id: match.data.id, game_number: 2, side_a_score: 15, side_b_score: 21 },
  ]);
  if (gameScores.error) throw new Error(`得点を作れませんでした: ${gameScores.error.message}`);
}

export async function deleteFinalScenario(): Promise<void> {
  const matchups = await admin
    .from('matchups')
    .delete()
    .eq('stage_id', KNOCKOUT_STAGE_ID)
    .eq('sort_order', FINAL_MATCHUP_SORT_ORDER);
  if (matchups.error) throw new Error(`後片付けに失敗（対戦）: ${matchups.error.message}`);

  const players = await admin.from('players').delete().in('player_number', FINAL_PLAYER_NUMBERS);
  if (players.error) throw new Error(`後片付けに失敗（選手）: ${players.error.message}`);
}
