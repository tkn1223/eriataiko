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

describe('anon（ブラウザに配る鍵）でできること・できないこと', () => {
  beforeAll(async () => {
    // 読み取りテストのために 1 件だけ用意する
    const { error } = await admin
      .from('operators')
      .upsert({ name: 'テスト運営', display_order: 999 }, { onConflict: 'name' })
      .select();
    // name に一意制約が無い場合は upsert が使えないので、無ければ insert する
    if (error) {
      const { count } = await admin.from('operators').select('*', { count: 'exact', head: true });
      if (!count) await admin.from('operators').insert({ name: 'テスト運営', display_order: 999 });
    }
  });

  test('operators は読める（入場画面が名前一覧を出すため）', async () => {
    const { data, error } = await anon.from('operators').select('id, name').limit(10);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test('operators は追加できない', async () => {
    const { error } = await anon.from('operators').insert({ name: '勝手に追加' });
    expect(error).not.toBeNull();
  });

  test('operators は書き換えられない', async () => {
    const { data: before } = await admin.from('operators').select('id, name').limit(1);
    const target = before?.[0];
    expect(target).toBeDefined();

    await anon.from('operators').update({ name: '書き換えた' }).eq('id', target!.id);

    // エラーの有無ではなく「実際に変わっていないこと」を確かめる。
    // RLS で対象行が 0 件になると、エラーを返さず何もしない場合があるため。
    const { data: after } = await admin
      .from('operators')
      .select('name')
      .eq('id', target!.id)
      .single();
    expect(after?.name).toBe(target!.name);
  });

  test('operators は削除できない', async () => {
    const { data: before } = await admin.from('operators').select('*', { count: 'exact' });
    const countBefore = before?.length ?? 0;

    await anon.from('operators').delete().neq('name', '');

    const { data: after } = await admin.from('operators').select('*', { count: 'exact' });
    expect(after?.length ?? 0).toBe(countBefore);
  });

  test('write_logs は読めない（誰が何をしたかの記録なので隠す）', async () => {
    const { data, error } = await anon.from('write_logs').select('*').limit(1);
    // ポリシーが無いので、エラーになるか 0 件になる。どちらでも「見えていない」
    const leaked = !error && (data?.length ?? 0) > 0;
    expect(leaked).toBe(false);
  });
});

/**
 * 大会データの表（段1で追加した 10 表）。
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
    const entry = await one('entries');
    const stage = await one('stages');
    const teamMatch = await one('team_matches');
    const match = await one('matches');
    const matchPlayer = await one('match_players');
    const game = await one('games');

    // まだ大会に参加していない人を 1 人作る。
    // 「参加を勝手に足せない」を、重複エラーではなく RLS で落ちることとして確かめるため。
    const spare = await admin
      .from('players')
      .insert({ number: 700001, name: 'rls-テスト用（未参加）' })
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
    const { data: usedEntries } = await admin
      .from('match_players')
      .select('entry_id')
      .eq('match_id', (await one('match_players', 'id, match_id')).match_id);
    const { data: spareEntry } = await admin
      .from('entries')
      .select('id')
      .not('id', 'in', `(${(usedEntries ?? []).map((r) => r.entry_id).join(',')})`)
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
      insert: { competition_id: competition.id, number: 99, name: 'anon が勝手に追加' },
      findInserted: { number: 99 },
      update: { id: team.id, column: 'name', value: '書き換えた' },
      keepId: team.id,
    };
    cases.players = {
      insert: { number: 700099, name: 'anon が勝手に追加' },
      findInserted: { number: 700099 },
      update: { id: player.id, column: 'name', value: '書き換えた' },
      keepId: player.id,
    };
    cases.entries = {
      insert: { competition_id: competition.id, player_id: sparePlayerId },
      findInserted: { player_id: sparePlayerId },
      update: { id: entry.id, column: 'can_input', value: true },
      keepId: entry.id,
    };
    cases.stages = {
      insert: { competition_id: competition.id, name: 'anon が勝手に追加', kind: 'league' },
      findInserted: { name: 'anon が勝手に追加' },
      update: { id: stage.id, column: 'name', value: '書き換えた' },
      keepId: stage.id,
    };
    cases.team_matches = {
      insert: {
        stage_id: stage.id,
        label: 'anon が勝手に追加',
        slot_a_label: 'あ',
        slot_b_label: 'い',
      },
      findInserted: { label: 'anon が勝手に追加' },
      update: { id: teamMatch.id, column: 'label', value: '書き換えた' },
      keepId: teamMatch.id,
    };
    cases.matches = {
      insert: {
        team_match_id: teamMatch.id,
        division_id: division.id,
        order_in_team_match: 987654,
      },
      findInserted: { order_in_team_match: 987654 },
      update: { id: match.id, column: 'status', value: 'done' },
      keepId: match.id,
    };
    cases.match_players = {
      insert: { match_id: emptyMatch.id, side: 'a', entry_id: entry.id, player_order: 1 },
      findInserted: { match_id: emptyMatch.id },
      update: { id: matchPlayer.id, column: 'entry_id', value: spareEntry!.id },
      keepId: matchPlayer.id,
    };
    cases.games = {
      insert: { match_id: emptyMatch.id, game_number: 99 },
      findInserted: { match_id: emptyMatch.id, game_number: 99 },
      update: { id: game.id, column: 'score_a', value: 999 },
      keepId: game.id,
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
    'entries',
    'stages',
    'team_matches',
    'matches',
    'match_players',
    'games',
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
