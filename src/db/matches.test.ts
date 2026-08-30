import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import { matchesDb } from '@/db/matches';

/**
 * `matchesDb` を本物のデータベースに当てて確かめる。
 *
 * usecases 側は偽物の DB で分岐を確かめている（save-score.test.ts など）。
 * ここでしか分からないのは **実際に表へどう書かれるか**で、
 * 仕様の受け入れ基準（行が増えない / updated_at が新しくなる）はここが担当。
 *
 * 実行前に `npm run db:start` が必要。
 */

const admin = getSupabaseAdminClient();

/** このテストが作ったものだけを消せるように、実行ごとに違う印を付ける */
const tag = `test-${Math.random().toString(36).slice(2, 10)}`;

let competitionId: string;
let matchId: string;

beforeAll(async () => {
  const competition = await admin
    .from('competitions')
    .insert({ name: `${tag} 大会`, held_on: '2027-03-14' })
    .select('id')
    .single();
  expect(competition.error, `大会の作成に失敗: ${competition.error?.message}`).toBeNull();
  competitionId = competition.data!.id;

  const division = await admin
    .from('divisions')
    .insert({ competition_id: competitionId, name: '1部', sort_order: 10 })
    .select('id')
    .single();
  const stage = await admin
    .from('stages')
    .insert({ competition_id: competitionId, name: '予選リーグ', format: 'league', sort_order: 10 })
    .select('id')
    .single();
  // チームは作らない。対戦は「空枠のラベル」だけでも成り立つ（team_matches_side_a_known）。
  const matchup = await admin
    .from('matchups')
    .insert({
      stage_id: stage.data!.id,
      round_name: '予選 1回戦',
      side_a_slot_label: '予選1位',
      side_b_slot_label: '予選2位',
    })
    .select('id')
    .single();
  const match = await admin
    .from('matches')
    .insert({
      matchup_id: matchup.data!.id,
      division_id: division.data!.id,
      order_in_matchup: 1,
      max_game_count: 3,
    })
    .select('id')
    .single();
  expect(match.error, `試合の作成に失敗: ${match.error?.message}`).toBeNull();
  matchId = match.data!.id;
});

afterAll(async () => {
  // 大会を消せば、ぶら下がっているものは全部一緒に消える。
  const { error } = await admin.from('competitions').delete().eq('id', competitionId);
  if (error) throw new Error(`後片付けに失敗（大会）: ${error.message}`);
});

/** 保存された 1 ゲームぶんの行をそのまま読む */
async function readRows(gameNumber: number) {
  const { data, error } = await admin
    .from('game_scores')
    .select('id, side_a_score, side_b_score, created_at, updated_at')
    .eq('match_id', matchId)
    .eq('game_number', gameNumber);
  expect(error, `得点の読み出しに失敗: ${error?.message}`).toBeNull();
  return data!;
}

describe('得点を送ると game_scores に保存され、もう一度送ると同じ行が書き換わる', () => {
  test('2 回送っても行は 1 つのまま、中身だけ入れ替わる', async () => {
    const first = new Date('2027-03-14T01:00:00.000Z');
    const second = new Date('2027-03-14T01:05:00.000Z');

    await matchesDb.saveGameScore({
      matchId,
      gameNumber: 1,
      sideAScore: 5,
      sideBScore: 3,
      now: first,
    });
    const [saved] = await readRows(1);
    expect(saved.side_a_score).toBe(5);

    await matchesDb.saveGameScore({
      matchId,
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      now: second,
    });
    const rows = await readRows(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(saved.id);
    expect(rows[0].side_a_score).toBe(21);
    expect(rows[0].side_b_score).toBe(15);
  });

  test('updated_at が前より新しくなり、created_at は最初のまま残る', async () => {
    const first = new Date('2027-03-14T02:00:00.000Z');
    const second = new Date('2027-03-14T02:10:00.000Z');

    await matchesDb.saveGameScore({
      matchId,
      gameNumber: 2,
      sideAScore: 1,
      sideBScore: 0,
      now: first,
    });
    const [before] = await readRows(2);

    await matchesDb.saveGameScore({
      matchId,
      gameNumber: 2,
      sideAScore: 2,
      sideBScore: 0,
      now: second,
    });
    const [after] = await readRows(2);

    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime()
    );
    // 書き換えで created_at まで上書きすると「いつ最初に入力されたか」が消える
    expect(after.created_at).toBe(before.created_at);
  });

  test('まだ行の無いゲームに 2 つ同時に届いても、行は 1 つのまま両方が届く', async () => {
    // 得点係が 2 台で開いていると起きる。「無ければ作る」を素直に書くと
    // 両方が作りに行き、あとから届いた側が重複で弾かれて得点を取りこぼす。
    // ここは max_game_count を見ない層なので、4 ゲーム目でも書ける（上限の判定は save-score.ts）。
    const now = new Date('2027-03-14T06:00:00.000Z');
    const both = await Promise.allSettled([
      matchesDb.saveGameScore({ matchId, gameNumber: 4, sideAScore: 1, sideBScore: 0, now }),
      matchesDb.saveGameScore({ matchId, gameNumber: 4, sideAScore: 0, sideBScore: 1, now }),
    ]);

    expect(both.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await readRows(4)).toHaveLength(1);
  });
});

describe('試合の進み具合を書き換える', () => {
  test('markLive で live になり started_at が入る', async () => {
    const startedAt = new Date('2027-03-14T03:00:00.000Z');
    await matchesDb.markLive({ matchId, startedAt });

    const match = await matchesDb.findMatch(matchId);
    expect(match?.status).toBe('live');

    const { data } = await admin.from('matches').select('started_at').eq('id', matchId).single();
    expect(data!.started_at).not.toBeNull();
  });

  test('finish で done になり、reopen で live に戻って finished_at が空になる', async () => {
    await matchesDb.finish({ matchId, finishedAt: new Date('2027-03-14T04:00:00.000Z') });
    const finished = await admin
      .from('matches')
      .select('status, finished_at')
      .eq('id', matchId)
      .single();
    expect(finished.data!.status).toBe('done');
    expect(finished.data!.finished_at).not.toBeNull();

    await matchesDb.reopen({ matchId });
    const reopened = await admin
      .from('matches')
      .select('status, finished_at')
      .eq('id', matchId)
      .single();
    expect(reopened.data!.status).toBe('live');
    expect(reopened.data!.finished_at).toBeNull();
  });
});

describe('findGameScores', () => {
  test('保存したゲームを得点の形で返す', async () => {
    await matchesDb.saveGameScore({
      matchId,
      gameNumber: 3,
      sideAScore: 11,
      sideBScore: 9,
      now: new Date('2027-03-14T05:00:00.000Z'),
    });

    const scores = await matchesDb.findGameScores(matchId);
    expect(scores).toContainEqual({ gameNumber: 3, sideAScore: 11, sideBScore: 9 });
  });
});

describe('無い試合 ID を渡したとき', () => {
  test('存在しない uuid では null が返る', async () => {
    expect(await matchesDb.findMatch('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  test('uuid ですらない文字列でも、落ちずに null が返る', async () => {
    // ここで throw すると Route Handler が 500 を返し、「無い試合」なのに
    // 得点係には「サーバー側でエラー」と出てしまう
    expect(await matchesDb.findMatch('まだ決まっていない')).toBeNull();
  });
});
