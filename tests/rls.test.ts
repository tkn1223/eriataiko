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
 * 大会データの表（12 表）。
 *
 * ここが破れると、URL を知っている人なら誰でも得点や組み合わせを書き換えられる。
 *
 * 判定のしかたに 3 つ決まりがある。
 *
 * 1. **エラーの有無だけで判定しない。** 書き換え・削除は RLS で対象行が 0 件になると、
 *    エラーを返さず何もしない場合がある。かならず admin で読み直して確かめる。
 *    追加だけは弾かれると必ずエラー（42501 = 権限が無い）を返すので、その中身も確かめる。
 *    重複や参照切れのエラーで落ちていたら、RLS を確かめられていないことになるため。
 * 2. **行数を数えない。** テストファイルは同じデータベースに対して同時に走るので、
 *    別のファイルが行を足すと数がずれて、原因の分からない失敗になる（実際になった）。
 *    「狙った 1 行があるか / 変わっていないか」だけを見る。
 * 3. **狙う行は、ほかのファイルが触らない行にする。** ほかのファイルは自分用の試合を
 *    作って出場者を足し、終わったら消す。「先頭の 1 行」「出場者のいない試合」のように
 *    探して選ぶと、その途中の行を拾ってしまう。拾った試合に向こうが出場者を 3 人足して
 *    「anon が足した行が 3 行ある」と落ちたことがある（anon の追加はちゃんと弾かれていた）。
 *    そこで、追加を試す試合はこのファイルで作り、書き換え・削除を試す行は
 *    サンプルデータ（いちばん古い行）から選ぶ。
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
  /**
   * このファイル専用の空の大会。チームの追加を試す先であり、出場者・得点の追加を試す試合の置き場。
   * サンプルの大会はチーム 1〜4 が埋まっていて、空き番号が無い。
   */
  let spareCompetitionId = '';

  beforeAll(async () => {
    // いちばん古い行＝サンプルデータを選ぶ。並びを指定しないと、ほかのファイルが
    // 作ってすぐ消す行が先頭に来ることがあり、「消せないはずの行が消えた」と落ちる。
    // サンプルは同じ時刻に入るので、id で並びを固定する。
    const one = async (table: string, columns = 'id') => {
      const { data, error } = await admin
        .from(table)
        .select(columns)
        .order('created_at')
        .order('id')
        .limit(1)
        .single();
      expect(error, `${table} にサンプルデータが必要: ${error?.message}`).toBeNull();
      return data as unknown as Record<string, string>;
    };

    const competition = await one('competitions');
    const hall = await one('halls');
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

    // チームは 1 大会に 4 つまで（色が 4 色しかない）。サンプルの大会は 1〜4 が
    // 埋まっているので、空の大会を 1 つ作ってそこへの追加を試す。
    // ここを埋まっている大会にすると、RLS ではなく重複で落ちて意味が無くなる。
    const spareCompetition = await admin
      .from('competitions')
      .insert({ name: 'rls-テスト用（空の大会）', held_on: '2099-01-02' })
      .select('id')
      .single();
    spareCompetitionId = spareCompetition.data!.id;

    // 出場者も得点もまだ無い試合を、このファイル専用に作る（決まり 3）。
    // 埋まっている試合を狙うと、RLS ではなく重複で落ちて意味が無くなる。
    // 探して選ぶと、ほかのファイルが作った途中の試合を拾うことがある。
    // 置き場は専用の空の大会なので、ほかのファイルの集計にも混ざらない。
    const insertOne = async (table: string, row: Record<string, unknown>) => {
      const { data, error } = await admin.from(table).insert(row).select('id').single();
      expect(error, `${table} の準備に失敗: ${error?.message}`).toBeNull();
      return (data as { id: string }).id;
    };
    const ownDivisionId = await insertOne('divisions', {
      competition_id: spareCompetitionId,
      name: 'rls-テスト用',
    });
    const ownStageId = await insertOne('stages', {
      competition_id: spareCompetitionId,
      name: 'rls-テスト用',
      format: 'league',
    });
    const ownMatchupId = await insertOne('matchups', {
      stage_id: ownStageId,
      round_name: 'rls-テスト用',
      side_a_slot_label: 'あ',
      side_b_slot_label: 'い',
    });
    const ownEmptyMatchId = await insertOne('matches', {
      matchup_id: ownMatchupId,
      division_id: ownDivisionId,
      order_in_matchup: 1,
    });

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
    cases.halls = {
      insert: { name: 'anon が勝手に追加した会場', court_count: 8 },
      findInserted: { name: 'anon が勝手に追加した会場' },
      update: { id: hall.id, column: 'name', value: '書き換えた' },
      keepId: hall.id,
    };
    cases.teams = {
      insert: { competition_id: spareCompetitionId, team_number: 1, name: 'anon が勝手に追加' },
      findInserted: { competition_id: spareCompetitionId, team_number: 1 },
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
        match_id: ownEmptyMatchId,
        side: 'a',
        participant_id: participant.id,
        order_in_pair: 1,
      },
      findInserted: { match_id: ownEmptyMatchId },
      update: { id: matchPlayer.id, column: 'participant_id', value: spareParticipant!.id },
      keepId: matchPlayer.id,
    };
    cases.game_scores = {
      insert: { match_id: ownEmptyMatchId, game_number: 99 },
      findInserted: { match_id: ownEmptyMatchId, game_number: 99 },
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
    if (spareCompetitionId) {
      // 中に作った部・段階・対戦・試合も、大会ごと連鎖して消える
      await admin.from('competitions').delete().eq('id', spareCompetitionId);
    }
  });

  const tables = [
    'competitions',
    'halls',
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

    const { error } = await anon.from(table).insert(insert);
    // 権限が無いこと（42501）で弾かれているか。重複や参照切れで落ちているなら、
    // 中身の値が間違っていて RLS を確かめられていない（決まり 1）
    expect(
      error?.code,
      `権限が無いことで弾かれるはず（実際: ${error?.message ?? 'エラー無し＝追加できてしまった'}）`
    ).toBe('42501');

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

/**
 * 試合の入力担当の列（matches.scorer_participant_id / scorer_claimed_at）。
 * 担当は全員の画面に映すので読めるが、書けるのは入口（Route Handler）だけ。
 * 書けてしまうと、誰でも他人を担当から外したり、自分を担当にして点を止められる。
 */
describe('試合の入力担当の列は anon から読めるが書けない', () => {
  let matchId = '';
  let participantId = '';
  const scoredAt = '2027-01-22T10:00:00.000Z';

  beforeAll(async () => {
    // サンプルデータ（いちばん古い行）を選ぶ。ほかのファイルが作ってすぐ消す試合を拾わないため
    const oldest = (table: string) =>
      admin.from(table).select('id').order('created_at').order('id').limit(1).single();
    const { data: match } = await oldest('matches');
    const { data: participant } = await oldest('participants');
    matchId = match!.id;
    participantId = participant!.id;
    await admin
      .from('matches')
      .update({ scorer_participant_id: participantId, scorer_claimed_at: scoredAt })
      .eq('id', matchId);
  });

  afterAll(async () => {
    await admin
      .from('matches')
      .update({ scorer_participant_id: null, scorer_claimed_at: null })
      .eq('id', matchId);
  });

  test('担当と担当になった時刻を読める', async () => {
    const { data, error } = await anon
      .from('matches')
      .select('scorer_participant_id, scorer_claimed_at')
      .eq('id', matchId)
      .single();
    expect(error).toBeNull();
    expect(data!.scorer_participant_id).toBe(participantId);
    expect(new Date(data!.scorer_claimed_at!).toISOString()).toBe(scoredAt);
  });

  test('担当を空にする書き換えは通らない', async () => {
    await anon.from('matches').update({ scorer_participant_id: null }).eq('id', matchId);

    const { data } = await admin
      .from('matches')
      .select('scorer_participant_id')
      .eq('id', matchId)
      .single();
    expect(data!.scorer_participant_id).toBe(participantId);
  });

  test('担当になった時刻の書き換えは通らない', async () => {
    await anon
      .from('matches')
      .update({ scorer_claimed_at: '2099-01-01T00:00:00.000Z' })
      .eq('id', matchId);

    const { data } = await admin
      .from('matches')
      .select('scorer_claimed_at')
      .eq('id', matchId)
      .single();
    expect(new Date(data!.scorer_claimed_at!).toISOString()).toBe(scoredAt);
  });
});
