import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * 大会データの表が「入れてはいけない形」を本当に拒むかのテスト。
 *
 * 表の形を守るのは制約（unique / check）だけ。アプリ側で気をつけるだけでは、
 * 当日の慌ただしい入力や取り込みの不備で必ず崩れる。
 * ここが緑なら「壊れたデータは入らない」と言える。
 *
 * 仕様: docs/specs/2026-08-20-competition-tables.md
 * 実行前に `npx supabase start` が必要。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

/** このテストが作ったものだけを消せるように、実行ごとに違う印を付ける */
const tag = `test-${Math.random().toString(36).slice(2, 10)}`;
/** 番号は全体で一意。サンプルデータ（1〜99）とぶつからない帯を実行ごとに取る */
const numberBase = 800000 + Math.floor(Math.random() * 100000);

type Ids = {
  competitionId: string;
  divisionId: string;
  teamAId: string;
  teamBId: string;
  leagueStageId: string;
  koStageId: string;
  leagueTeamMatchId: string;
  entryIds: string[];
};

let ids: Ids;

/** 失敗しても中身が分かるように、エラーを添えて値を取り出す */
async function insertOne<T extends Record<string, unknown>>(table: string, row: T) {
  const { data, error } = await admin.from(table).insert(row).select('id').single();
  expect(error, `${table} の追加に失敗: ${error?.message}`).toBeNull();
  return data!.id as string;
}

beforeAll(async () => {
  const competitionId = await insertOne('competitions', {
    name: `${tag} 大会`,
    held_on: '2027-01-22',
  });

  const divisionId = await insertOne('divisions', {
    competition_id: competitionId,
    name: '2部',
    display_order: 20,
  });

  const teamAId = await insertOne('teams', {
    competition_id: competitionId,
    number: 1,
    name: `${tag} チーム1`,
  });
  const teamBId = await insertOne('teams', {
    competition_id: competitionId,
    number: 2,
    name: `${tag} チーム2`,
  });

  const entryIds: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const playerId = await insertOne('players', {
      number: numberBase + i,
      name: `${tag} 選手${i}`,
    });
    entryIds.push(
      await insertOne('entries', {
        competition_id: competitionId,
        player_id: playerId,
        team_id: i < 3 ? teamAId : teamBId,
        division_id: divisionId,
      })
    );
  }

  const leagueStageId = await insertOne('stages', {
    competition_id: competitionId,
    name: '予選リーグ',
    kind: 'league',
    display_order: 10,
  });
  const koStageId = await insertOne('stages', {
    competition_id: competitionId,
    name: '決勝トーナメント',
    kind: 'knockout',
    display_order: 20,
  });

  const leagueTeamMatchId = await insertOne('team_matches', {
    stage_id: leagueStageId,
    label: '予選 1回戦',
    team_a_id: teamAId,
    team_b_id: teamBId,
  });

  ids = {
    competitionId,
    divisionId,
    teamAId,
    teamBId,
    leagueStageId,
    koStageId,
    leagueTeamMatchId,
    entryIds,
  };
});

afterAll(async () => {
  // 大会を消せば、ぶら下がっているものは全部一緒に消える。
  // ここが黙って失敗すると次回の実行に残骸が残り、原因の分からない失敗になる（実際になった）。
  if (ids?.competitionId) {
    const { error } = await admin.from('competitions').delete().eq('id', ids.competitionId);
    if (error) throw new Error(`後片付けに失敗（大会）: ${error.message}`);
  }
  const { error } = await admin.from('players').delete().like('name', `${tag}%`);
  if (error) throw new Error(`後片付けに失敗（人）: ${error.message}`);
});

/** 試合を 1 つ作る。既定は予選の対戦にぶら下げる */
async function makeMatch(over: Record<string, unknown> = {}) {
  return insertOne('matches', {
    team_match_id: ids.leagueTeamMatchId,
    division_id: ids.divisionId,
    order_in_team_match: Math.floor(Math.random() * 1_000_000),
    points_to_win: 15,
    games_to_win: 1,
    ...over,
  });
}

describe('人と参加', () => {
  test('同じ大会に同じ人を 2 回参加登録できない', async () => {
    const { data: entry } = await admin
      .from('entries')
      .select('player_id')
      .eq('id', ids.entryIds[0])
      .single();

    const { error } = await admin.from('entries').insert({
      competition_id: ids.competitionId,
      player_id: entry!.player_id,
      team_id: ids.teamBId,
    });
    expect(error).not.toBeNull();
  });

  test('人の番号は重複できない', async () => {
    const number = numberBase + 50;
    const first = await admin
      .from('players')
      .insert({ number, name: `${tag} 先` })
      .select('id');
    expect(first.error).toBeNull();

    const { error } = await admin.from('players').insert({ number, name: `${tag} 後` });
    expect(error).not.toBeNull();
  });

  test('試合に出ない入力係も登録できる（チームも部も空）', async () => {
    const playerId = await insertOne('players', { number: numberBase + 51, name: `${tag} 入力係` });
    const { error } = await admin.from('entries').insert({
      competition_id: ids.competitionId,
      player_id: playerId,
      can_input: true,
    });
    expect(error).toBeNull();
  });
});

describe('大会', () => {
  test('「いまの大会」は 2 件にできない', async () => {
    // サンプルデータに「いまの大会」が 1 件ある状態から始める
    const { data: current } = await admin.from('competitions').select('id').eq('is_current', true);
    expect(current?.length, 'サンプルデータに「いまの大会」が 1 件必要').toBe(1);

    const { error } = await admin
      .from('competitions')
      .insert({ name: `${tag} 2つ目の現行`, held_on: '2028-01-22', is_current: true });
    expect(error).not.toBeNull();
  });

  test('「いまの大会ではない」大会は何件でも足せる', async () => {
    const { error } = await admin.from('competitions').insert([
      { name: `${tag} 過去A`, held_on: '2025-01-22' },
      { name: `${tag} 過去B`, held_on: '2026-01-22' },
    ]);
    expect(error).toBeNull();
    // このテストが作った 2 件だけを消す。`like('${tag}%')` だと
    // 土台の大会まで巻き込んで、あとのテストが全部こける（実際にこけた）。
    await admin
      .from('competitions')
      .delete()
      .in('name', [`${tag} 過去A`, `${tag} 過去B`]);
  });
});

describe('対戦（決勝の空枠）', () => {
  test('チームが未定でも「予選1位」の空枠として保存できる', async () => {
    const { error } = await admin.from('team_matches').insert({
      stage_id: ids.koStageId,
      label: '準決勝1',
      slot_a_label: '予選1位',
      slot_b_label: '予選4位',
    });
    expect(error).toBeNull();
  });

  test('チームも空枠ラベルも両方空にはできない', async () => {
    const { error } = await admin.from('team_matches').insert({
      stage_id: ids.koStageId,
      label: '中身なし',
    });
    expect(error).not.toBeNull();
  });

  test('片側だけ決まっている状態も保存できる（勝ち上がりの途中）', async () => {
    const { error } = await admin.from('team_matches').insert({
      stage_id: ids.koStageId,
      label: '決勝',
      team_a_id: ids.teamAId,
      slot_b_label: '準決勝2 勝者',
    });
    expect(error).toBeNull();
  });
});

describe('出場者（ダブルス）', () => {
  test('1 つの試合の片側に 2 人（ダブルス）を入れられる', async () => {
    const matchId = await makeMatch();
    const { error } = await admin.from('match_players').insert([
      { match_id: matchId, side: 'a', entry_id: ids.entryIds[0], player_order: 1 },
      { match_id: matchId, side: 'a', entry_id: ids.entryIds[1], player_order: 2 },
      { match_id: matchId, side: 'b', entry_id: ids.entryIds[3], player_order: 1 },
      { match_id: matchId, side: 'b', entry_id: ids.entryIds[4], player_order: 2 },
    ]);
    expect(error).toBeNull();
  });

  test('同じ位置に 2 人目は入れられない', async () => {
    const matchId = await makeMatch();
    await admin
      .from('match_players')
      .insert({ match_id: matchId, side: 'a', entry_id: ids.entryIds[0], player_order: 1 });

    const { error } = await admin
      .from('match_players')
      .insert({ match_id: matchId, side: 'a', entry_id: ids.entryIds[1], player_order: 1 });
    expect(error).not.toBeNull();
  });

  test('同じ人を同じ試合に 2 回入れられない（両側に出るのも防ぐ）', async () => {
    const matchId = await makeMatch();
    await admin
      .from('match_players')
      .insert({ match_id: matchId, side: 'a', entry_id: ids.entryIds[0], player_order: 1 });

    const { error } = await admin
      .from('match_players')
      .insert({ match_id: matchId, side: 'b', entry_id: ids.entryIds[0], player_order: 1 });
    expect(error).not.toBeNull();
  });

  test('3 人目は入れられない（位置は 1 か 2 だけ）', async () => {
    const matchId = await makeMatch();
    const { error } = await admin
      .from('match_players')
      .insert({ match_id: matchId, side: 'a', entry_id: ids.entryIds[0], player_order: 3 });
    expect(error).not.toBeNull();
  });

  test('同じ 2 人を複数の試合に入れられる（決勝でペア固定の形）', async () => {
    const first = await makeMatch();
    const second = await makeMatch();
    const pair = (matchId: string) => [
      { match_id: matchId, side: 'a', entry_id: ids.entryIds[0], player_order: 1 },
      { match_id: matchId, side: 'a', entry_id: ids.entryIds[1], player_order: 2 },
    ];

    expect((await admin.from('match_players').insert(pair(first))).error).toBeNull();
    expect((await admin.from('match_players').insert(pair(second))).error).toBeNull();
  });

  test('試合ごとに別の 2 人を入れられる（予選でペアばらばらの形）', async () => {
    const first = await makeMatch();
    const second = await makeMatch();

    expect(
      (
        await admin.from('match_players').insert([
          { match_id: first, side: 'a', entry_id: ids.entryIds[0], player_order: 1 },
          { match_id: first, side: 'a', entry_id: ids.entryIds[1], player_order: 2 },
        ])
      ).error
    ).toBeNull();

    expect(
      (
        await admin.from('match_players').insert([
          { match_id: second, side: 'a', entry_id: ids.entryIds[0], player_order: 1 },
          { match_id: second, side: 'a', entry_id: ids.entryIds[2], player_order: 2 },
        ])
      ).error
    ).toBeNull();
  });
});

describe('試合のルールと結果', () => {
  test('同じ大会の中で、予選と決勝に別々の「何点先取」を入れられる', async () => {
    const koTeamMatchId = await insertOne('team_matches', {
      stage_id: ids.koStageId,
      label: '準決勝2',
      slot_a_label: '予選2位',
      slot_b_label: '予選3位',
    });

    const leagueMatch = await makeMatch({ points_to_win: 15, games_to_win: 1 });
    const koMatch = await makeMatch({
      team_match_id: koTeamMatchId,
      points_to_win: 21,
      games_to_win: 2,
    });

    const { data } = await admin
      .from('matches')
      .select('id, points_to_win, games_to_win')
      .in('id', [leagueMatch, koMatch]);

    const byId = Object.fromEntries((data ?? []).map((m) => [m.id, m]));
    expect(byId[leagueMatch].points_to_win).toBe(15);
    expect(byId[koMatch].points_to_win).toBe(21);
    expect(byId[koMatch].games_to_win).toBe(2);
  });

  test('何も指定しなければ 15 点・1 ゲームになる', async () => {
    const { data, error } = await admin
      .from('matches')
      .insert({
        team_match_id: ids.leagueTeamMatchId,
        division_id: ids.divisionId,
        order_in_team_match: Math.floor(Math.random() * 1_000_000),
      })
      .select('points_to_win, games_to_win')
      .single();

    expect(error).toBeNull();
    expect(data!.points_to_win).toBe(15);
    expect(data!.games_to_win).toBe(1);
  });

  test.each(['retired_a', 'retired_b', 'walkover_a', 'walkover_b'])(
    '棄権・不戦勝（%s）を記録できる',
    async (outcome) => {
      const matchId = await makeMatch();
      const { error } = await admin
        .from('matches')
        .update({ outcome, status: 'done' })
        .eq('id', matchId);
      expect(error).toBeNull();
    }
  );

  test('決められていない状態や結果は入らない', async () => {
    const matchId = await makeMatch();
    expect(
      (await admin.from('matches').update({ status: 'とちゅう' }).eq('id', matchId)).error
    ).not.toBeNull();
    expect(
      (await admin.from('matches').update({ outcome: 'なんとなく' }).eq('id', matchId)).error
    ).not.toBeNull();
  });

  test('新しい試合は「これから」から始まる', async () => {
    const matchId = await makeMatch();
    const { data } = await admin
      .from('matches')
      .select('status, outcome')
      .eq('id', matchId)
      .single();
    expect(data!.status).toBe('waiting');
    expect(data!.outcome).toBe('normal');
  });
});

describe('得点', () => {
  test('同じ試合に同じゲーム番号は 2 つ作れない', async () => {
    const matchId = await makeMatch();
    expect(
      (await admin.from('games').insert({ match_id: matchId, game_number: 1 })).error
    ).toBeNull();

    const { error } = await admin.from('games').insert({ match_id: matchId, game_number: 1 });
    expect(error).not.toBeNull();
  });

  test('得点はマイナスにできない', async () => {
    const matchId = await makeMatch();
    const { error } = await admin
      .from('games')
      .insert({ match_id: matchId, game_number: 1, score_a: -1 });
    expect(error).not.toBeNull();
  });

  test('得点は 0 から始まる', async () => {
    const matchId = await makeMatch();
    const { data } = await admin
      .from('games')
      .insert({ match_id: matchId, game_number: 1 })
      .select('score_a, score_b')
      .single();
    expect(data).toEqual({ score_a: 0, score_b: 0 });
  });
});

describe('Realtime の配信対象', () => {
  /**
   * 配信対象かどうかは PostgREST から確かめられない（システムの表を読めない）ので、
   * マイグレーションの中身を読んで確かめる。弱いテストだが、
   * 「消したことに誰も気づかない」よりはよい。
   */
  test('matches と games が配信対象に入っている', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260820000000_competition_tables.sql'),
      'utf8'
    );
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.matches/);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.games/);
  });
});
