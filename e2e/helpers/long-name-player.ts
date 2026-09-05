import { createClient } from '@supabase/supabase-js';
import { loadTestEnv } from '../../tests/load-env.mjs';
import type { Database } from '@/types/database';

/**
 * 「長い名前の選手」を手元のデータベースに用意する（画面幅の確認用）。
 *
 * `supabase/seed.sql` の名前は「さとう」など短いものばかりで、
 * **狭い画面で崩れるのは長い名前のとき**（実際に「とペア」「3部」が消える崩れを見つけた）。
 * 見本に無い形なので、この確認のためだけにここで作って、終わったら消す。
 *
 * 書き込みなので service_role の鍵が要る。**鍵はコードに書かず `.env.test` から読む**
 * （中身はローカル Supabase の固定値。本番の鍵はここに来ない）。
 */

const env = loadTestEnv();
const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// seed.sql の固定 id（大会・段・チーム・部）。
const COMPETITION_ID = 'c0000000-0000-4000-8000-000000000001';
const STAGE_ID = '50000000-0000-4000-8000-000000000001';
const TEAM_ID = '40000000-0000-4000-8000-000000000001';
const DIVISION_ID = 'd0000000-0000-4000-8000-000000000003';

export const LONG_NAME_TEAM = '愛知南';
/** 本人。姓が 2 つ並ぶ形は実際にある（合同チームの登録名など）。 */
export const LONG_NAME_PLAYER = '長谷川・五十嵐';
/**
 * ペアの相手と対戦相手。空白入りの長い名前でも崩れないかを見る。
 * ペアの相手だけ**全角空白**にしてある。名簿には全角で登録された名前があり、
 * 半角空白だけを区切りとして扱っていたころは、ここで「とペア」が切れた（実測）。
 */
const PARTNER_NAME = '五十嵐　十四郎';
const OPPONENT_NAMES = ['佐々木 太郎', '長谷川 一二三'];

/** seed.sql（1〜16）ともテスト（899901〜）ともぶつからない番号。 */
const PLAYER_NUMBERS = [899801, 899802, 899803, 899804];
/** seed.sql の対戦は 10〜60。片付け前に落ちても消せるよう、この並び順を目印にする。 */
const MATCHUP_SORT_ORDER = 900;

/**
 * 長い名前の選手と、その人が出る 3 試合（終了・未実施・進行中）を作る。
 *
 * 前回の後片付けが済んでいなくても動くよう、作る前に必ず消してから作る。
 */
export async function createLongNamePlayer(): Promise<void> {
  await deleteLongNamePlayer();

  const players = await admin
    .from('players')
    .insert([
      { player_number: PLAYER_NUMBERS[0], name: LONG_NAME_PLAYER },
      { player_number: PLAYER_NUMBERS[1], name: PARTNER_NAME },
      { player_number: PLAYER_NUMBERS[2], name: OPPONENT_NAMES[0] },
      { player_number: PLAYER_NUMBERS[3], name: OPPONENT_NAMES[1] },
    ])
    .select('id, player_number');
  if (players.error) throw new Error(`長い名前の選手を作れませんでした: ${players.error.message}`);
  const playerIdByNumber = new Map(players.data.map((row) => [row.player_number, row.id]));

  // 部を入れない = 「部が無い人」でも見出しが崩れないかを一緒に確かめる。
  const participants = await admin
    .from('participants')
    .insert(
      players.data.map((row) => ({
        competition_id: COMPETITION_ID,
        player_id: row.id,
        team_id: TEAM_ID,
      }))
    )
    .select('id, player_id');
  if (participants.error)
    throw new Error(`参加者を作れませんでした: ${participants.error.message}`);
  const participantIdByPlayerId = new Map(participants.data.map((row) => [row.player_id, row.id]));
  const participantOf = (playerNumber: number) =>
    participantIdByPlayerId.get(playerIdByNumber.get(playerNumber)!)!;

  // 回戦名も長いものを選ぶ（名前と重なったときがいちばん狭い）。
  const matchup = await admin
    .from('matchups')
    .insert({
      stage_id: STAGE_ID,
      round_name: '決勝トーナメント 準々決勝',
      side_a_team_id: TEAM_ID,
      side_b_slot_label: '予選4位',
      sort_order: MATCHUP_SORT_ORDER,
    })
    .select('id')
    .single();
  if (matchup.error) throw new Error(`対戦を作れませんでした: ${matchup.error.message}`);

  const matches = await admin
    .from('matches')
    .insert([
      // 終了。3 ゲームぶんの得点が右側にいちばん場所を取る。
      {
        matchup_id: matchup.data.id,
        division_id: DIVISION_ID,
        order_in_matchup: 1,
        status: 'done',
        max_game_count: 3,
      },
      // 未実施。コートも順番も 2 桁にして、右側がいちばん広くなる形にする。
      {
        matchup_id: matchup.data.id,
        division_id: DIVISION_ID,
        order_in_matchup: 2,
        status: 'waiting',
        court_number: 12,
        order_in_court: 11,
        max_game_count: 3,
      },
      {
        matchup_id: matchup.data.id,
        division_id: DIVISION_ID,
        order_in_matchup: 3,
        status: 'live',
        max_game_count: 3,
      },
    ])
    .select('id, order_in_matchup');
  if (matches.error) throw new Error(`試合を作れませんでした: ${matches.error.message}`);
  const matchIdByOrder = new Map(matches.data.map((row) => [row.order_in_matchup, row.id]));

  const matchPlayers = await admin.from('match_players').insert(
    matches.data.flatMap((match) => [
      { match_id: match.id, side: 'a', participant_id: participantOf(899801), order_in_pair: 1 },
      { match_id: match.id, side: 'a', participant_id: participantOf(899802), order_in_pair: 2 },
      { match_id: match.id, side: 'b', participant_id: participantOf(899803), order_in_pair: 1 },
      { match_id: match.id, side: 'b', participant_id: participantOf(899804), order_in_pair: 2 },
    ])
  );
  if (matchPlayers.error)
    throw new Error(`出場者を作れませんでした: ${matchPlayers.error.message}`);

  const doneMatchId = matchIdByOrder.get(1)!;
  const liveMatchId = matchIdByOrder.get(3)!;
  const gameScores = await admin.from('game_scores').insert([
    { match_id: doneMatchId, game_number: 1, side_a_score: 21, side_b_score: 19 },
    { match_id: doneMatchId, game_number: 2, side_a_score: 18, side_b_score: 21 },
    { match_id: doneMatchId, game_number: 3, side_a_score: 21, side_b_score: 15 },
    { match_id: liveMatchId, game_number: 1, side_a_score: 11, side_b_score: 21 },
    { match_id: liveMatchId, game_number: 2, side_a_score: 8, side_b_score: 6 },
  ]);
  if (gameScores.error) throw new Error(`得点を作れませんでした: ${gameScores.error.message}`);
}

/** 作ったものを消す。対戦を消せば試合・出場者・得点も、選手を消せば参加も一緒に消える。 */
export async function deleteLongNamePlayer(): Promise<void> {
  const matchups = await admin
    .from('matchups')
    .delete()
    .eq('stage_id', STAGE_ID)
    .eq('sort_order', MATCHUP_SORT_ORDER);
  if (matchups.error) throw new Error(`後片付けに失敗（対戦）: ${matchups.error.message}`);

  const players = await admin.from('players').delete().in('player_number', PLAYER_NUMBERS);
  if (players.error) throw new Error(`後片付けに失敗（選手）: ${players.error.message}`);
}
