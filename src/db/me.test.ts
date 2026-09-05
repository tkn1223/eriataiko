import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import { findMyPageData } from '@/db/me';

/**
 * `findMyPageData` を本物のデータベースに当てて確かめる。
 *
 * `build-my-page-view.test.ts` は組み立てのロジックを偽物の入力で確かめている。
 * ここでしか分からないのは **実際の表からどう読み出すか**。
 *
 * 実行前に `npm run db:start` が必要。
 */

const admin = getSupabaseAdminClient();

/** このテストが作ったものだけを消せるように、実行ごとに違う印を付ける */
const tag = `test-me-${Math.random().toString(36).slice(2, 10)}`;

let competitionId: string;
let divisionId: string;
let teamAId: string;
let teamBId: string;
let stageId: string;
let matchupId: string;
let myPlayerId: string;
let partnerPlayerId: string;
let opponentPlayerId: string;
let doneMatchId: string;
let waitingMatchId: string;
/** 自分が出ていない試合。マイページに混ざらないことを確かめるために作る。 */
let othersMatchId: string;
/** 元々「いまの大会」だった大会の id。テストの後に必ず元へ戻す。 */
let previousCurrentCompetitionId: string | null;

beforeAll(async () => {
  const competition = await admin
    .from('competitions')
    .insert({ name: `${tag} 大会`, held_on: '2027-05-01' })
    .select('id')
    .single();
  expect(competition.error, `大会の作成に失敗: ${competition.error?.message}`).toBeNull();
  competitionId = competition.data!.id;

  const division = await admin
    .from('divisions')
    .insert({ competition_id: competitionId, name: '1部', sort_order: 10 })
    .select('id')
    .single();
  divisionId = division.data!.id;

  const teamA = await admin
    .from('teams')
    .insert({ competition_id: competitionId, team_number: 1, name: `${tag} チームA` })
    .select('id')
    .single();
  teamAId = teamA.data!.id;

  const teamB = await admin
    .from('teams')
    .insert({ competition_id: competitionId, team_number: 2, name: `${tag} チームB` })
    .select('id')
    .single();
  teamBId = teamB.data!.id;

  const stage = await admin
    .from('stages')
    .insert({ competition_id: competitionId, name: '予選リーグ', format: 'league', sort_order: 10 })
    .select('id')
    .single();
  stageId = stage.data!.id;

  const matchup = await admin
    .from('matchups')
    .insert({
      stage_id: stageId,
      round_name: '予選 1回戦',
      side_a_team_id: teamAId,
      side_b_team_id: teamBId,
    })
    .select('id')
    .single();
  matchupId = matchup.data!.id;

  // player_number はテスト同士でぶつからないよう 899998 以上を使う（supabase/seed.sql のコメント）
  const players = await admin
    .from('players')
    .insert([
      { player_number: 899901, name: `${tag} 自分` },
      { player_number: 899902, name: `${tag} 相方` },
      { player_number: 899903, name: `${tag} 相手` },
    ])
    .select('id, player_number');
  expect(players.error, `選手の作成に失敗: ${players.error?.message}`).toBeNull();
  myPlayerId = players.data!.find((p) => p.player_number === 899901)!.id;
  partnerPlayerId = players.data!.find((p) => p.player_number === 899902)!.id;
  opponentPlayerId = players.data!.find((p) => p.player_number === 899903)!.id;

  const participants = await admin
    .from('participants')
    .insert([
      {
        competition_id: competitionId,
        player_id: myPlayerId,
        team_id: teamAId,
        division_id: divisionId,
      },
      {
        competition_id: competitionId,
        player_id: partnerPlayerId,
        team_id: teamAId,
        division_id: divisionId,
      },
      {
        competition_id: competitionId,
        player_id: opponentPlayerId,
        team_id: teamBId,
        division_id: divisionId,
      },
    ])
    .select('id, player_id');
  expect(participants.error, `参加者の作成に失敗: ${participants.error?.message}`).toBeNull();
  const myParticipantId = participants.data!.find((p) => p.player_id === myPlayerId)!.id;
  const partnerParticipantId = participants.data!.find((p) => p.player_id === partnerPlayerId)!.id;
  const opponentParticipantId = participants.data!.find(
    (p) => p.player_id === opponentPlayerId
  )!.id;

  const matches = await admin
    .from('matches')
    .insert([
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'done',
        max_game_count: 1,
      },
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 2,
        status: 'waiting',
        max_game_count: 1,
        court_number: 2,
        order_in_court: 3,
      },
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 3,
        status: 'done',
        max_game_count: 1,
      },
    ])
    .select('id, status, order_in_matchup');
  expect(matches.error, `試合の作成に失敗: ${matches.error?.message}`).toBeNull();
  doneMatchId = matches.data!.find((m) => m.order_in_matchup === 1)!.id;
  waitingMatchId = matches.data!.find((m) => m.order_in_matchup === 2)!.id;
  othersMatchId = matches.data!.find((m) => m.order_in_matchup === 3)!.id;

  const matchPlayers = await admin.from('match_players').insert([
    { match_id: doneMatchId, side: 'a', participant_id: myParticipantId, order_in_pair: 1 },
    { match_id: doneMatchId, side: 'a', participant_id: partnerParticipantId, order_in_pair: 2 },
    { match_id: doneMatchId, side: 'b', participant_id: opponentParticipantId, order_in_pair: 1 },
    { match_id: waitingMatchId, side: 'a', participant_id: myParticipantId, order_in_pair: 1 },
    {
      match_id: waitingMatchId,
      side: 'b',
      participant_id: opponentParticipantId,
      order_in_pair: 1,
    },
    // 自分は出ない試合（相方 対 相手）
    { match_id: othersMatchId, side: 'a', participant_id: partnerParticipantId, order_in_pair: 1 },
    { match_id: othersMatchId, side: 'b', participant_id: opponentParticipantId, order_in_pair: 1 },
  ]);
  expect(matchPlayers.error, `出場者の作成に失敗: ${matchPlayers.error?.message}`).toBeNull();

  const gameScores = await admin.from('game_scores').insert([
    { match_id: doneMatchId, game_number: 1, side_a_score: 15, side_b_score: 11 },
    { match_id: othersMatchId, game_number: 1, side_a_score: 21, side_b_score: 3 },
  ]);
  expect(gameScores.error, `得点の作成に失敗: ${gameScores.error?.message}`).toBeNull();

  // is_current は「true の行が高々 1 件」という制約がある（tests/schema.test.ts）。
  // 元の「いまの大会」を覚えておいてから、自分の大会に切り替える。
  const current = await admin
    .from('competitions')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  expect(current.error, `いまの大会の確認に失敗: ${current.error?.message}`).toBeNull();
  previousCurrentCompetitionId = current.data?.id ?? null;

  if (previousCurrentCompetitionId) {
    const unset = await admin
      .from('competitions')
      .update({ is_current: false })
      .eq('id', previousCurrentCompetitionId);
    expect(unset.error, `元の大会を外すのに失敗: ${unset.error?.message}`).toBeNull();
  }
  const setCurrent = await admin
    .from('competitions')
    .update({ is_current: true })
    .eq('id', competitionId);
  expect(setCurrent.error, `いまの大会への切り替えに失敗: ${setCurrent.error?.message}`).toBeNull();
});

afterAll(async () => {
  // 大会を消せば、ぶら下がっているものは全部一緒に消える。選手（players）だけは
  // 大会にぶら下がっていないので、別に消す。
  const { error } = await admin.from('competitions').delete().eq('id', competitionId);
  if (error) throw new Error(`後片付けに失敗（大会）: ${error.message}`);

  const { error: playersError } = await admin
    .from('players')
    .delete()
    .in('id', [myPlayerId, partnerPlayerId, opponentPlayerId]);
  if (playersError) throw new Error(`後片付けに失敗（選手）: ${playersError.message}`);

  // 他のテストが「いまの大会」に頼っているので、必ず元に戻す。
  if (previousCurrentCompetitionId) {
    const { error: restoreError } = await admin
      .from('competitions')
      .update({ is_current: true })
      .eq('id', previousCurrentCompetitionId);
    if (restoreError) throw new Error(`いまの大会を戻すのに失敗: ${restoreError.message}`);
  }

  // 戻し漏れをここで声に出す。「いまの大会」が 0 件のまま残ると、
  // 手元の入場（/enter）が全部こけて、原因が分からなくなる（実際になった）。
  const { data: current, error: currentError } = await admin
    .from('competitions')
    .select('id')
    .eq('is_current', true);
  if (currentError) throw new Error(`いまの大会の確認に失敗: ${currentError.message}`);
  if (current.length !== 1) {
    throw new Error(
      `「いまの大会」が ${current.length} 件になっています。` +
        '手元のデータベースを npm run db:reset で作り直してください。'
    );
  }
});

describe('findMyPageData', () => {
  test('自分の名前・チーム・部と、自分が出る試合が読める', async () => {
    const data = await findMyPageData(myPlayerId);

    expect(data).not.toBeNull();
    expect(data!.profile.name).toBe(`${tag} 自分`);
    expect(data!.profile.teamNumber).toBe(1);
    expect(data!.profile.teamName).toBe(`${tag} チームA`);
    expect(data!.profile.divisionId).toBe(divisionId);
    expect(data!.divisions).toContainEqual({ id: divisionId, sortOrder: 10 });
    expect(data!.matches).toHaveLength(2);
  });

  test('自分が出ていない試合は読み込まれない', async () => {
    const data = await findMyPageData(myPlayerId);

    expect(data!.matches.map((m) => m.matchId)).not.toContain(othersMatchId);
  });

  test('終了した試合には、対戦相手の名前と得点が入っている', async () => {
    const data = await findMyPageData(myPlayerId);
    const done = data!.matches.find((m) => m.matchId === doneMatchId)!;

    expect(done.status).toBe('done');
    expect(done.roundName).toBe('予選 1回戦');
    expect(done.gameScores).toContainEqual({ gameNumber: 1, sideAScore: 15, sideBScore: 11 });

    const names = done.players.map((p) => p.name).sort();
    expect(names).toEqual([`${tag} 相手`, `${tag} 相方`, `${tag} 自分`].sort());
  });

  test('未実施の試合には、コート番号と順番が入っている', async () => {
    const data = await findMyPageData(myPlayerId);
    const waiting = data!.matches.find((m) => m.matchId === waitingMatchId)!;

    expect(waiting.status).toBe('waiting');
    expect(waiting.courtNumber).toBe(2);
    expect(waiting.orderInCourt).toBe(3);
  });

  test('いまの大会に自分の参加者情報が無ければ null が返る', async () => {
    const noSuchPlayer = await admin
      .from('players')
      .insert({ player_number: 899999, name: `${tag} 出ない人` })
      .select('id')
      .single();
    expect(noSuchPlayer.error).toBeNull();

    try {
      expect(await findMyPageData(noSuchPlayer.data!.id)).toBeNull();
    } finally {
      await admin.from('players').delete().eq('id', noSuchPlayer.data!.id);
    }
  });
});

describe('いまの大会が無いとき', () => {
  test('null が返る', async () => {
    const clearCurrent = await admin
      .from('competitions')
      .update({ is_current: false })
      .eq('is_current', true);
    expect(clearCurrent.error).toBeNull();

    try {
      expect(await findMyPageData(myPlayerId)).toBeNull();
    } finally {
      await admin.from('competitions').update({ is_current: true }).eq('id', competitionId);
    }
  });
});
