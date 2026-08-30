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
 *       docs/specs/2026-08-29-naming-review.md（表と列の名前）
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
  leagueMatchupId: string;
  participantIds: string[];
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
    sort_order: 20,
  });

  const teamAId = await insertOne('teams', {
    competition_id: competitionId,
    team_number: 1,
    name: `${tag} チーム1`,
  });
  const teamBId = await insertOne('teams', {
    competition_id: competitionId,
    team_number: 2,
    name: `${tag} チーム2`,
  });

  const participantIds: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const playerId = await insertOne('players', {
      player_number: numberBase + i,
      name: `${tag} 選手${i}`,
    });
    participantIds.push(
      await insertOne('participants', {
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
    format: 'league',
    sort_order: 10,
  });
  const koStageId = await insertOne('stages', {
    competition_id: competitionId,
    name: '決勝トーナメント',
    format: 'knockout',
    sort_order: 20,
  });

  const leagueMatchupId = await insertOne('matchups', {
    stage_id: leagueStageId,
    round_name: '予選 1回戦',
    side_a_team_id: teamAId,
    side_b_team_id: teamBId,
  });

  ids = {
    competitionId,
    divisionId,
    teamAId,
    teamBId,
    leagueStageId,
    koStageId,
    leagueMatchupId,
    participantIds,
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
    matchup_id: ids.leagueMatchupId,
    division_id: ids.divisionId,
    order_in_matchup: Math.floor(Math.random() * 1_000_000),
    ...over,
  });
}

describe('人と参加', () => {
  test('同じ大会に同じ人を 2 回参加登録できない', async () => {
    const { data: participant } = await admin
      .from('participants')
      .select('player_id')
      .eq('id', ids.participantIds[0])
      .single();

    const { error } = await admin.from('participants').insert({
      competition_id: ids.competitionId,
      player_id: participant!.player_id,
      team_id: ids.teamBId,
    });
    expect(error).not.toBeNull();
  });

  test('人の番号は重複できない', async () => {
    const playerNumber = numberBase + 50;
    const first = await admin
      .from('players')
      .insert({ player_number: playerNumber, name: `${tag} 先` })
      .select('id');
    expect(first.error).toBeNull();

    const { error } = await admin
      .from('players')
      .insert({ player_number: playerNumber, name: `${tag} 後` });
    expect(error).not.toBeNull();
  });

  test('試合に出ない入力係も登録できる（チームも部も空）', async () => {
    const playerId = await insertOne('players', {
      player_number: numberBase + 51,
      name: `${tag} 入力係`,
    });
    const { error } = await admin.from('participants').insert({
      competition_id: ids.competitionId,
      player_id: playerId,
    });
    expect(error).toBeNull();
  });

  test('「得点を入れてよいか」の列は持たない（参加者は全員入れられる）', async () => {
    // 入力できないのは観戦者だけで、観戦者はこの表に行を持たない。
    // 経緯は docs/specs/2026-08-29-naming-review.md の「決めたこと」。
    const { error } = await admin
      .from('participants')
      .update({ can_input: true })
      .eq('id', ids.participantIds[0]);
    expect(error, '入力可否の列が復活している').not.toBeNull();
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
    const { error } = await admin.from('matchups').insert({
      stage_id: ids.koStageId,
      round_name: '準決勝1',
      side_a_slot_label: '予選1位',
      side_b_slot_label: '予選4位',
    });
    expect(error).toBeNull();
  });

  test('チームも空枠ラベルも両方空にはできない', async () => {
    const { error } = await admin.from('matchups').insert({
      stage_id: ids.koStageId,
      round_name: '中身なし',
    });
    expect(error).not.toBeNull();
  });

  test('片側だけ決まっている状態も保存できる（勝ち上がりの途中）', async () => {
    const { error } = await admin.from('matchups').insert({
      stage_id: ids.koStageId,
      round_name: '決勝',
      side_a_team_id: ids.teamAId,
      side_b_slot_label: '準決勝2 勝者',
    });
    expect(error).toBeNull();
  });
});

describe('出場者（ダブルス）', () => {
  test('1 つの試合の片側に 2 人（ダブルス）を入れられる', async () => {
    const matchId = await makeMatch();
    const { error } = await admin.from('match_players').insert([
      { match_id: matchId, side: 'a', participant_id: ids.participantIds[0], order_in_pair: 1 },
      { match_id: matchId, side: 'a', participant_id: ids.participantIds[1], order_in_pair: 2 },
      { match_id: matchId, side: 'b', participant_id: ids.participantIds[3], order_in_pair: 1 },
      { match_id: matchId, side: 'b', participant_id: ids.participantIds[4], order_in_pair: 2 },
    ]);
    expect(error).toBeNull();
  });

  test('同じ位置に 2 人目は入れられない', async () => {
    const matchId = await makeMatch();
    await admin.from('match_players').insert({
      match_id: matchId,
      side: 'a',
      participant_id: ids.participantIds[0],
      order_in_pair: 1,
    });

    const { error } = await admin.from('match_players').insert({
      match_id: matchId,
      side: 'a',
      participant_id: ids.participantIds[1],
      order_in_pair: 1,
    });
    expect(error).not.toBeNull();
  });

  test('同じ人を同じ試合に 2 回入れられない（両側に出るのも防ぐ）', async () => {
    const matchId = await makeMatch();
    await admin.from('match_players').insert({
      match_id: matchId,
      side: 'a',
      participant_id: ids.participantIds[0],
      order_in_pair: 1,
    });

    const { error } = await admin.from('match_players').insert({
      match_id: matchId,
      side: 'b',
      participant_id: ids.participantIds[0],
      order_in_pair: 1,
    });
    expect(error).not.toBeNull();
  });

  test('3 人目は入れられない（位置は 1 か 2 だけ）', async () => {
    const matchId = await makeMatch();
    const { error } = await admin.from('match_players').insert({
      match_id: matchId,
      side: 'a',
      participant_id: ids.participantIds[0],
      order_in_pair: 3,
    });
    expect(error).not.toBeNull();
  });

  test('同じ 2 人を複数の試合に入れられる（決勝でペア固定の形）', async () => {
    const first = await makeMatch();
    const second = await makeMatch();
    const pair = (matchId: string) => [
      { match_id: matchId, side: 'a', participant_id: ids.participantIds[0], order_in_pair: 1 },
      { match_id: matchId, side: 'a', participant_id: ids.participantIds[1], order_in_pair: 2 },
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
          { match_id: first, side: 'a', participant_id: ids.participantIds[0], order_in_pair: 1 },
          { match_id: first, side: 'a', participant_id: ids.participantIds[1], order_in_pair: 2 },
        ])
      ).error
    ).toBeNull();

    expect(
      (
        await admin.from('match_players').insert([
          { match_id: second, side: 'a', participant_id: ids.participantIds[0], order_in_pair: 1 },
          { match_id: second, side: 'a', participant_id: ids.participantIds[2], order_in_pair: 2 },
        ])
      ).error
    ).toBeNull();
  });
});

describe('段 × 部ごとの決めごと', () => {
  test('同じ段・同じ部の決めごとは 2 つ作れない', async () => {
    const first = await admin
      .from('match_settings')
      .insert({ stage_id: ids.koStageId, division_id: ids.divisionId, max_game_count: 3 });
    expect(first.error).toBeNull();

    const { error } = await admin
      .from('match_settings')
      .insert({ stage_id: ids.koStageId, division_id: ids.divisionId, max_game_count: 1 });
    expect(error).not.toBeNull();
  });

  test('ゲーム数は 0 や負の数にできない', async () => {
    expect(
      (
        await admin
          .from('match_settings')
          .insert({ stage_id: ids.leagueStageId, division_id: ids.divisionId, max_game_count: 0 })
      ).error
    ).not.toBeNull();

    expect(
      (
        await admin
          .from('match_settings')
          .insert({ stage_id: ids.leagueStageId, division_id: ids.divisionId, max_game_count: -1 })
      ).error
    ).not.toBeNull();
  });
});

describe('試合のルールと結果', () => {
  test('試合数に上限が無い（1 つの対戦に何試合でも入る）', async () => {
    // 実際の大会では 1 対戦あたり 3 試合のことも 8 試合のこともある。
    // 「今回は何試合」をシステム側で決めてしまわないこと。
    for (let i = 0; i < 20; i += 1) {
      await makeMatch({ order_in_matchup: 5000 + i });
    }
    const { data } = await admin
      .from('matches')
      .select('id')
      .eq('matchup_id', ids.leagueMatchupId)
      .gte('order_in_matchup', 5000)
      .lte('order_in_matchup', 5019);
    expect(data?.length).toBe(20);
  });

  test('「何点先取」は持たない（勝敗は得点の多いほうで決まる）', async () => {
    // 持たせると「1部は 21,21,11 / 2部は 15,15,5」のように試合ごとの設定作業が増える。
    // 勝敗の判定にはそもそも要らないので持たない。
    // **「何ゲームやるか」は別**。試合を終わらせる処理に要るので max_game_count で持つ。
    const matchId = await makeMatch();
    const { error } = await admin.from('matches').update({ points_to_win: 21 }).eq('id', matchId);
    expect(error, '点数の上限を持つ列が復活している').not.toBeNull();
  });

  test('何ゲームやるかは持つ。既定は 3', async () => {
    // 既定を 3 にしているのは、取り込みが入れ忘れたとき 1 だと
    // 第 2・第 3 ゲームの得点を当日入れられなくなるため。
    const matchId = await makeMatch();
    const { data } = await admin
      .from('matches')
      .select('max_game_count')
      .eq('id', matchId)
      .single();
    expect(data!.max_game_count).toBe(3);
  });

  test('試合のゲーム数は 0 や負の数にできない', async () => {
    const matchId = await makeMatch();
    expect(
      (await admin.from('matches').update({ max_game_count: 0 }).eq('id', matchId)).error
    ).not.toBeNull();
    expect(
      (await admin.from('matches').update({ max_game_count: -1 }).eq('id', matchId)).error
    ).not.toBeNull();
  });

  test('ゲームは何本でも入る（1 ゲームでも 5 ゲームでも）', async () => {
    const matchId = await makeMatch();
    const rows = [1, 2, 3, 4, 5].map((n) => ({
      match_id: matchId,
      game_number: n,
      side_a_score: 21,
      side_b_score: 19,
    }));
    const { error } = await admin.from('game_scores').insert(rows);
    expect(error).toBeNull();
  });

  test.each(['retired_side_a', 'retired_side_b', 'walkover_side_a', 'walkover_side_b'])(
    '棄権・不戦勝（%s）を記録できる',
    async (ending) => {
      const matchId = await makeMatch();
      const { error } = await admin
        .from('matches')
        .update({ ending, status: 'done' })
        .eq('id', matchId);
      expect(error).toBeNull();
    }
  );

  test.each(['retired_a', 'walkover_b'])('古い書き方（%s）は入らない', async (ending) => {
    const matchId = await makeMatch();
    const { error } = await admin.from('matches').update({ ending }).eq('id', matchId);
    expect(error).not.toBeNull();
  });

  test('決められていない状態や終わり方は入らない', async () => {
    const matchId = await makeMatch();
    expect(
      (await admin.from('matches').update({ status: 'とちゅう' }).eq('id', matchId)).error
    ).not.toBeNull();
    expect(
      (await admin.from('matches').update({ ending: 'なんとなく' }).eq('id', matchId)).error
    ).not.toBeNull();
  });

  test('新しい試合は「これから」から始まる', async () => {
    const matchId = await makeMatch();
    const { data } = await admin
      .from('matches')
      .select('status, ending')
      .eq('id', matchId)
      .single();
    expect(data!.status).toBe('waiting');
    expect(data!.ending).toBe('normal');
  });
});

describe('得点', () => {
  test('同じ試合に同じゲーム番号は 2 つ作れない', async () => {
    const matchId = await makeMatch();
    expect(
      (await admin.from('game_scores').insert({ match_id: matchId, game_number: 1 })).error
    ).toBeNull();

    const { error } = await admin.from('game_scores').insert({ match_id: matchId, game_number: 1 });
    expect(error).not.toBeNull();
  });

  test('得点はマイナスにできない', async () => {
    const matchId = await makeMatch();
    const { error } = await admin
      .from('game_scores')
      .insert({ match_id: matchId, game_number: 1, side_a_score: -1 });
    expect(error).not.toBeNull();
  });

  test('得点は 0 から始まる', async () => {
    const matchId = await makeMatch();
    const { data } = await admin
      .from('game_scores')
      .insert({ match_id: matchId, game_number: 1 })
      .select('side_a_score, side_b_score')
      .single();
    expect(data).toEqual({ side_a_score: 0, side_b_score: 0 });
  });
});

describe('Realtime の配信対象', () => {
  /**
   * 配信対象かどうかは PostgREST から確かめられない（システムの表を読めない）ので、
   * マイグレーションの中身を読んで確かめる。弱いテストだが、
   * 「消したことに誰も気づかない」よりはよい。
   *
   * 配信対象は**表そのもの**を指しているので、名前を変えても外れない。
   * よって「20260820 で追加した」ことと「20260829 で名前を変えただけ」の
   * 2 つがそろっていれば、いまの配信対象は matches と game_scores になる。
   */
  test('matches と得点の表が配信対象に入っている', () => {
    const added = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260820000000_competition_tables.sql'),
      'utf8'
    );
    expect(added).toMatch(/alter publication supabase_realtime add table public\.matches/);
    expect(added).toMatch(/alter publication supabase_realtime add table public\.games/);

    const renamed = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260829000000_naming_review.sql'),
      'utf8'
    );
    expect(renamed).toMatch(/alter table public\.games\s+rename to game_scores/);
    // 配信対象から外す文が紛れ込んでいないこと
    expect(renamed).not.toMatch(/drop table/);
  });
});
