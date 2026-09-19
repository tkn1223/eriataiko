import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import { findCourtsData } from '@/db/courts';

/**
 * `findCourtsData` を本物のデータベースに当てて確かめる。
 *
 * `build-courts-view.test.ts` は組み立てのロジックを偽物の入力で確かめている。
 * ここでしか分からないのは**実際の表からどう読み出すか**。
 *
 * `src/db/me.test.ts` と同じやり方で、自分が作った大会の id をそのまま渡す
 * （共有の「いまの大会」には触らないので、他のテストと同時に流しても競合しない）。
 *
 * 実行前に `npm run db:start` が必要。
 */

const admin = getSupabaseAdminClient();

const tag = `test-courts-${Math.random().toString(36).slice(2, 10)}`;

let competitionId: string;
let divisionId: string;
let teamAId: string;
let teamBId: string;
let leagueStageId: string;
let knockoutStageId: string;
let decidedMatchupId: string;
let undecidedMatchupId: string;
let myPlayerId: string;
let partnerPlayerId: string;
let opponentPlayerId: string;
let liveMatchId: string;
let waitingMatchId: string;
let undecidedMatchId: string;
let myParticipantId: string;

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

  const teams = await admin
    .from('teams')
    .insert([
      { competition_id: competitionId, team_number: 1, name: `${tag} チームA` },
      { competition_id: competitionId, team_number: 6, name: `${tag} チームB` },
    ])
    .select('id, team_number');
  expect(teams.error, `チームの作成に失敗: ${teams.error?.message}`).toBeNull();
  teamAId = teams.data!.find((t) => t.team_number === 1)!.id;
  teamBId = teams.data!.find((t) => t.team_number === 6)!.id;

  const stages = await admin
    .from('stages')
    .insert([
      {
        competition_id: competitionId,
        name: '予選リーグ',
        format: 'league',
        sort_order: 10,
      },
      {
        competition_id: competitionId,
        name: '決勝トーナメント',
        format: 'knockout',
        sort_order: 20,
      },
    ])
    .select('id, format');
  expect(stages.error, `段の作成に失敗: ${stages.error?.message}`).toBeNull();
  leagueStageId = stages.data!.find((s) => s.format === 'league')!.id;
  knockoutStageId = stages.data!.find((s) => s.format === 'knockout')!.id;

  const matchups = await admin
    .from('matchups')
    .insert([
      {
        stage_id: leagueStageId,
        round_name: '予選 1回戦',
        side_a_team_id: teamAId,
        side_b_team_id: teamBId,
      },
      {
        stage_id: knockoutStageId,
        round_name: '準決勝1',
        side_a_team_id: teamAId,
        side_b_slot_label: '予選4位',
      },
    ])
    .select('id, round_name');
  expect(matchups.error, `対戦の作成に失敗: ${matchups.error?.message}`).toBeNull();
  decidedMatchupId = matchups.data!.find((m) => m.round_name === '予選 1回戦')!.id;
  undecidedMatchupId = matchups.data!.find((m) => m.round_name === '準決勝1')!.id;

  const players = await admin
    .from('players')
    .insert([
      { player_number: 899921, name: `${tag} 自分` },
      { player_number: 899922, name: `${tag} 相方` },
      { player_number: 899923, name: `${tag} 相手` },
    ])
    .select('id, player_number');
  expect(players.error, `選手の作成に失敗: ${players.error?.message}`).toBeNull();
  myPlayerId = players.data!.find((p) => p.player_number === 899921)!.id;
  partnerPlayerId = players.data!.find((p) => p.player_number === 899922)!.id;
  opponentPlayerId = players.data!.find((p) => p.player_number === 899923)!.id;

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
  myParticipantId = participants.data!.find((p) => p.player_id === myPlayerId)!.id;
  const partnerParticipantId = participants.data!.find((p) => p.player_id === partnerPlayerId)!.id;
  const opponentParticipantId = participants.data!.find(
    (p) => p.player_id === opponentPlayerId
  )!.id;

  const matches = await admin
    .from('matches')
    .insert([
      {
        matchup_id: decidedMatchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'live',
        max_game_count: 1,
        court_number: 90,
        order_in_court: 1,
      },
      {
        matchup_id: decidedMatchupId,
        division_id: divisionId,
        order_in_matchup: 2,
        status: 'waiting',
        max_game_count: 1,
        court_number: 90,
        order_in_court: 2,
      },
      {
        matchup_id: undecidedMatchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'waiting',
        max_game_count: 3,
        court_number: 91,
        order_in_court: 1,
      },
    ])
    .select('id, matchup_id, status');
  expect(matches.error, `試合の作成に失敗: ${matches.error?.message}`).toBeNull();
  liveMatchId = matches.data!.find((m) => m.status === 'live')!.id;
  waitingMatchId = matches.data!.find(
    (m) => m.status === 'waiting' && m.matchup_id === decidedMatchupId
  )!.id;
  undecidedMatchId = matches.data!.find((m) => m.matchup_id === undecidedMatchupId)!.id;

  const matchPlayers = await admin.from('match_players').insert([
    { match_id: liveMatchId, side: 'a', participant_id: myParticipantId, order_in_pair: 1 },
    {
      match_id: liveMatchId,
      side: 'a',
      participant_id: partnerParticipantId,
      order_in_pair: 2,
    },
    {
      match_id: liveMatchId,
      side: 'b',
      participant_id: opponentParticipantId,
      order_in_pair: 1,
    },
    { match_id: waitingMatchId, side: 'a', participant_id: myParticipantId, order_in_pair: 1 },
    {
      match_id: waitingMatchId,
      side: 'b',
      participant_id: opponentParticipantId,
      order_in_pair: 1,
    },
    // undecidedMatchId は side_b の相手がまだ決まっていないので match_players を入れない
    {
      match_id: undecidedMatchId,
      side: 'a',
      participant_id: partnerParticipantId,
      order_in_pair: 1,
    },
  ]);
  expect(matchPlayers.error, `出場者の作成に失敗: ${matchPlayers.error?.message}`).toBeNull();

  const gameScores = await admin
    .from('game_scores')
    .insert([{ match_id: liveMatchId, game_number: 1, side_a_score: 12, side_b_score: 9 }]);
  expect(gameScores.error, `得点の作成に失敗: ${gameScores.error?.message}`).toBeNull();
});

afterAll(async () => {
  const { error } = await admin.from('competitions').delete().eq('id', competitionId);
  if (error) throw new Error(`後片付けに失敗（大会）: ${error.message}`);

  const { error: playersError } = await admin
    .from('players')
    .delete()
    .in('id', [myPlayerId, partnerPlayerId, opponentPlayerId]);
  if (playersError) throw new Error(`後片付けに失敗（選手）: ${playersError.message}`);
});

describe('findCourtsData', () => {
  test('部・段・試合が読める', async () => {
    const data = await findCourtsData(competitionId, myPlayerId);

    expect(data.divisions).toContainEqual({ id: divisionId, sortOrder: 10 });
    expect(data.stages.map((s) => s.name).sort()).toEqual(
      ['予選リーグ', '決勝トーナメント'].sort()
    );
    expect(data.matches.map((m) => m.matchId).sort()).toEqual(
      [liveMatchId, waitingMatchId, undecidedMatchId].sort()
    );
  });

  test('進行中の試合に、両ペアの名前・チーム番号・得点が入っている', async () => {
    const data = await findCourtsData(competitionId, myPlayerId);
    const live = data.matches.find((m) => m.matchId === liveMatchId)!;

    expect(live.status).toBe('live');
    expect(live.roundName).toBe('予選 1回戦');
    expect(live.courtNumber).toBe(90);
    expect(live.sideA.teamNumber).toBe(1);
    expect(live.sideA.players.map((p) => p.name).sort()).toEqual(
      [`${tag} 自分`, `${tag} 相方`].sort()
    );
    expect(live.sideB.players.map((p) => p.name)).toEqual([`${tag} 相手`]);
    expect(live.gameScores).toContainEqual({ gameNumber: 1, sideAScore: 12, sideBScore: 9 });
  });

  test('相手がまだ決まっていない対戦は、空枠ラベルが入り選手名は空', async () => {
    const data = await findCourtsData(competitionId, myPlayerId);
    const undecided = data.matches.find((m) => m.matchId === undecidedMatchId)!;

    expect(undecided.sideB.slotLabel).toBe('予選4位');
    expect(undecided.sideB.players).toEqual([]);
    expect(undecided.sideB.teamNumber).toBeNull();
    // 決まっている側（a）は名前が入る
    expect(undecided.sideA.players.map((p) => p.name)).toEqual([`${tag} 相方`]);
  });

  test('自分の participants.id が myParticipantId として読める', async () => {
    const data = await findCourtsData(competitionId, myPlayerId);

    expect(data.myParticipantId).toBe(myParticipantId);
  });

  test('playerId が null（観戦者）のときは myParticipantId が null', async () => {
    const data = await findCourtsData(competitionId, null);

    expect(data.myParticipantId).toBeNull();
  });

  test('指定した大会にその人の参加者情報が無ければ myParticipantId は null', async () => {
    const noSuchPlayer = await admin
      .from('players')
      .insert({ player_number: 899929, name: `${tag} 出ない人` })
      .select('id')
      .single();
    expect(noSuchPlayer.error).toBeNull();

    try {
      const data = await findCourtsData(competitionId, noSuchPlayer.data!.id);
      expect(data.myParticipantId).toBeNull();
    } finally {
      await admin.from('players').delete().eq('id', noSuchPlayer.data!.id);
    }
  });
});
