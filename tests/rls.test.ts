import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * このアプリで一番守りたい約束のテスト。
 *
 *   ブラウザに配っている鍵（anon）では、データを **読めるだけ**。
 *   書き換え・追加・削除は一切できない。
 *
 * この鍵は URL を知っている人なら誰でも取り出せるので、
 * ここが破れると誰でも得点を書き換えられる。
 * 新しいテーブルを足したら、必ずこのファイルに 1 件テストを足すこと。
 *
 * 実行前に `npx supabase start` が必要。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

describe('書き込み記録（write_logs）', () => {
  test('write_logs は読めない（誰が何をしたかの記録なので隠す）', async () => {
    const { data, error } = await anon.from('write_logs').select('*').limit(1);
    // ポリシーが無いので、エラーになるか 0 件になる。どちらでも「見えていない」
    const leaked = !error && (data?.length ?? 0) > 0;
    expect(leaked).toBe(false);
  });
});

/**
 * 大会データの表（11 表）。
 *
 * ここが破れると、URL を知っている人なら誰でも得点や組み合わせを書き換えられる。
 *
 * 判定のしかたに 2 つ決まりがある。
 *
 * 1. **エラーの有無で判定しない。** RLS で対象行が 0 件になると、エラーを返さず
 *    何もしない場合がある。かならず admin で読み直して確かめる。
 * 2. **行数を数えない。** テストファイルは同じデータベースに対して同時に走るので、
 *    別のファイルが行を足すと数がずれて、原因の分からない失敗になる（実際になった）。
 *    「狙った 1 行があるか / 変わっていないか」だけを見る。
 */
describe('大会データの表は anon から読めるが書けない', () => {
  type Case = {
    /** anon が追加を試みる中身。**制約に通る正しい値**にする（RLS 以外の理由で落とさないため） */
    insert: Record<string, unknown>;
    /** 追加されてしまったかを探すための目印 */
    findInserted: Record<string, unknown>;
    /** 書き換えを試す行と列 */
    update: { id: string; column: string; value: unknown };
    /** 削除されていないことを確かめる行 */
    keepId: string;
  };

  const cases: Record<string, Case> = {};
  let sparePlayerId = '';

  beforeAll(async () => {
    const one = async (table: string, columns = 'id') => {
      const { data, error } = await admin.from(table).select(columns).limit(1).single();
      expect(error, `${table} にサンプルデータが必要: ${error?.message}`).toBeNull();
      return data as unknown as Record<string, string>;
    };

    const competition = await one('competitions');
    const division = await one('divisions');
    const team = await one('teams');
    const player = await one('players');
    const participant = await one('participants');
    const stage = await one('stages');
    const matchup = await one('matchups');
    const match = await one('matches');
    const matchPlayer = await one('match_players');
    const gameScore = await one('game_scores');
    const matchSetting = await one('match_settings');

    // まだ大会に参加していない人を 1 人作る。
    // 「参加を勝手に足せない」を、重複エラーではなく RLS で落ちることとして確かめるため。
    const spare = await admin
      .from('players')
      .insert({ player_number: 700001, name: 'rls-テスト用（未参加）' })
      .select('id')
      .single();
    sparePlayerId = spare.data!.id;

    // 出場者がまだ 1 人もいない試合を探す（決勝の枠はこれに当たる）。
    // 埋まっている試合を狙うと、RLS ではなく重複で落ちて意味が無くなる。
    const { data: allMatches } = await admin.from('matches').select('id');
    const { data: taken } = await admin.from('match_players').select('match_id');
    const takenIds = new Set((taken ?? []).map((r) => r.match_id));
    const emptyMatch = (allMatches ?? []).find((m) => !takenIds.has(m.id))!;
    expect(emptyMatch, '出場者のいない試合がサンプルデータに必要').toBeDefined();

    // 出場者の書き換え用に、その試合に出ていない参加を 1 つ探す
    const { data: usedParticipants } = await admin
      .from('match_players')
      .select('participant_id')
      .eq('match_id', (await one('match_players', 'id, match_id')).match_id);
    const { data: spareParticipant } = await admin
      .from('participants')
      .select('id')
      .not('id', 'in', `(${(usedParticipants ?? []).map((r) => r.participant_id).join(',')})`)
      .limit(1)
      .single();

    cases.competitions = {
      insert: { name: 'anon が勝手に追加', held_on: '2099-01-01' },
      findInserted: { name: 'anon が勝手に追加' },
      update: { id: competition.id, column: 'name', value: '書き換えた' },
      keepId: competition.id,
    };
    cases.divisions = {
      insert: { competition_id: competition.id, name: 'anon が勝手に追加' },
      findInserted: { name: 'anon が勝手に追加' },
      update: { id: division.id, column: 'name', value: '書き換えた' },
      keepId: division.id,
    };
    cases.teams = {
      insert: { competition_id: competition.id, team_number: 99, name: 'anon が勝手に追加' },
      findInserted: { team_number: 99 },
      update: { id: team.id, column: 'name', value: '書き換えた' },
      keepId: team.id,
    };
    cases.players = {
      insert: { player_number: 700099, name: 'anon が勝手に追加' },
      findInserted: { player_number: 700099 },
      update: { id: player.id, column: 'name', value: '書き換えた' },
      keepId: player.id,
    };
    cases.participants = {
      insert: { competition_id: competition.id, player_id: sparePlayerId },
      findInserted: { player_id: sparePlayerId },
      update: { id: participant.id, column: 'player_id', value: sparePlayerId },
      keepId: participant.id,
    };
    cases.stages = {
      insert: { competition_id: competition.id, name: 'anon が勝手に追加', format: 'league' },
      findInserted: { name: 'anon が勝手に追加' },
      update: { id: stage.id, column: 'name', value: '書き換えた' },
      keepId: stage.id,
    };
    cases.matchups = {
      insert: {
        stage_id: stage.id,
        round_name: 'anon が勝手に追加',
        side_a_slot_label: 'あ',
        side_b_slot_label: 'い',
      },
      findInserted: { round_name: 'anon が勝手に追加' },
      update: { id: matchup.id, column: 'round_name', value: '書き換えた' },
      keepId: matchup.id,
    };
    cases.matches = {
      insert: {
        matchup_id: matchup.id,
        division_id: division.id,
        order_in_matchup: 987654,
      },
      findInserted: { order_in_matchup: 987654 },
      update: { id: match.id, column: 'status', value: 'done' },
      keepId: match.id,
    };
    cases.match_players = {
      insert: {
        match_id: emptyMatch.id,
        side: 'a',
        participant_id: participant.id,
        order_in_pair: 1,
      },
      findInserted: { match_id: emptyMatch.id },
      update: { id: matchPlayer.id, column: 'participant_id', value: spareParticipant!.id },
      keepId: matchPlayer.id,
    };
    cases.game_scores = {
      insert: { match_id: emptyMatch.id, game_number: 99 },
      findInserted: { match_id: emptyMatch.id, game_number: 99 },
      update: { id: gameScore.id, column: 'side_a_score', value: 999 },
      keepId: gameScore.id,
    };
    cases.match_settings = {
      insert: { stage_id: stage.id, division_id: division.id, max_game_count: 9 },
      findInserted: { max_game_count: 9 },
      update: { id: matchSetting.id, column: 'max_game_count', value: 7 },
      keepId: matchSetting.id,
    };
  });

  afterAll(async () => {
    if (sparePlayerId) await admin.from('players').delete().eq('id', sparePlayerId);
  });

  const tables = [
    'competitions',
    'divisions',
    'teams',
    'players',
    'participants',
    'stages',
    'match_settings',
    'matchups',
    'matches',
    'match_players',
    'game_scores',
  ];

  test.each(tables)('%s は読める（画面が anon で読むため）', async (table) => {
    const { data, error } = await anon.from(table).select('id').limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test.each(tables)('%s は追加できない', async (table) => {
    const { insert, findInserted } = cases[table];

    await anon.from(table).insert(insert);

    const { data } = await admin.from(table).select('id').match(findInserted);
    expect(data ?? [], 'anon が追加した行が入ってしまっている').toEqual([]);
  });

  test.each(tables)('%s は書き換えられない', async (table) => {
    const { id, column, value } = cases[table].update;
    const { data: before } = await admin.from(table).select(column).eq('id', id).single();

    await anon
      .from(table)
      .update({ [column]: value })
      .eq('id', id);

    const { data: after } = await admin.from(table).select(column).eq('id', id).single();
    expect(after).toEqual(before);
  });

  test.each(tables)('%s は削除できない', async (table) => {
    const { keepId } = cases[table];

    await anon.from(table).delete().eq('id', keepId);

    const { data } = await admin.from(table).select('id').eq('id', keepId);
    expect(data?.length, '狙った行が消えている').toBe(1);
  });
});
