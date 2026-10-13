import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import { findMatchesBoardData, MAX_BOARD_MATCHES } from '@/db/matches-board';

/**
 * `findMatchesBoardData`（進行表が読む試合）を本物のデータベースに当てて確かめる。
 *
 * 組み立ては `build-matches-view.test.ts` が偽物の入力で確かめている。
 * ここでしか分からないのは**実際の表からどう読み出すか**。
 * 自分が作った大会の id をそのまま渡す（共有の「いまの大会」には触らない。courts.test.ts と同じ）。
 *
 * 実行前に `npm run db:start` が必要。
 */

const admin = getSupabaseAdminClient();

const tag = `test-matches-board-${Math.random().toString(36).slice(2, 10)}`;

let competitionId: string;
let divisionId: string;
let myPlayerId: string;
let partnerPlayerId: string;
let opponentPlayerId: string;
let myParticipantId: string;
let doneMatchId: string;
let liveMatchId: string;
let waitingMatchId: string;
let noCourtMatchId: string;
let retiredMatchId: string;

beforeAll(async () => {
  const competition = await admin
    .from('competitions')
    .insert({ name: `${tag} 大会`, held_on: '2027-07-01' })
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
      { competition_id: competitionId, team_number: 3, name: `${tag} チームB` },
    ])
    .select('id, team_number');
  const teamAId = teams.data!.find((t) => t.team_number === 1)!.id;
  const teamBId = teams.data!.find((t) => t.team_number === 3)!.id;

  const stage = await admin
    .from('stages')
    .insert({
      competition_id: competitionId,
      name: '予選リーグ',
      format: 'league',
      sort_order: 10,
    })
    .select('id')
    .single();

  const matchup = await admin
    .from('matchups')
    .insert({
      stage_id: stage.data!.id,
      round_name: '予選 1回戦',
      side_a_team_id: teamAId,
      side_b_team_id: teamBId,
    })
    .select('id')
    .single();
  expect(matchup.error, `対戦の作成に失敗: ${matchup.error?.message}`).toBeNull();
  const matchupId = matchup.data!.id;

  const players = await admin
    .from('players')
    .insert([
      { player_number: 899931, name: `${tag} 自分` },
      { player_number: 899932, name: `${tag} 相方` },
      { player_number: 899933, name: `${tag} 相手` },
    ])
    .select('id, player_number');
  expect(players.error, `選手の作成に失敗: ${players.error?.message}`).toBeNull();
  myPlayerId = players.data!.find((p) => p.player_number === 899931)!.id;
  partnerPlayerId = players.data!.find((p) => p.player_number === 899932)!.id;
  opponentPlayerId = players.data!.find((p) => p.player_number === 899933)!.id;

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
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'done',
        ending: 'normal',
        max_game_count: 3,
        court_number: 90,
        order_in_court: 1,
        finished_at: new Date().toISOString(),
      },
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 2,
        status: 'live',
        ending: 'normal',
        max_game_count: 1,
        court_number: 90,
        order_in_court: 2,
      },
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 3,
        status: 'waiting',
        ending: 'normal',
        max_game_count: 1,
        court_number: 90,
        order_in_court: 3,
      },
      // コートがまだ決まっていない試合
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 4,
        status: 'waiting',
        ending: 'normal',
        max_game_count: 1,
        court_number: null,
        order_in_court: null,
      },
      // 棄権で終わった試合（飛び番号のコート）
      {
        matchup_id: matchupId,
        division_id: divisionId,
        order_in_matchup: 5,
        status: 'done',
        ending: 'retired_side_a',
        max_game_count: 1,
        court_number: 93,
        order_in_court: 1,
        finished_at: new Date().toISOString(),
      },
    ])
    .select('id, order_in_matchup');
  expect(matches.error, `試合の作成に失敗: ${matches.error?.message}`).toBeNull();
  const idOf = (order: number) => matches.data!.find((m) => m.order_in_matchup === order)!.id;
  doneMatchId = idOf(1);
  liveMatchId = idOf(2);
  waitingMatchId = idOf(3);
  noCourtMatchId = idOf(4);
  retiredMatchId = idOf(5);

  const matchPlayers = await admin.from('match_players').insert([
    { match_id: doneMatchId, side: 'a', participant_id: myParticipantId, order_in_pair: 1 },
    { match_id: doneMatchId, side: 'a', participant_id: partnerParticipantId, order_in_pair: 2 },
    { match_id: doneMatchId, side: 'b', participant_id: opponentParticipantId, order_in_pair: 1 },
    { match_id: liveMatchId, side: 'a', participant_id: partnerParticipantId, order_in_pair: 1 },
    { match_id: liveMatchId, side: 'b', participant_id: opponentParticipantId, order_in_pair: 1 },
    { match_id: retiredMatchId, side: 'a', participant_id: partnerParticipantId, order_in_pair: 1 },
    {
      match_id: retiredMatchId,
      side: 'b',
      participant_id: opponentParticipantId,
      order_in_pair: 1,
    },
  ]);
  expect(matchPlayers.error, `出場者の作成に失敗: ${matchPlayers.error?.message}`).toBeNull();

  const gameScores = await admin.from('game_scores').insert([
    { match_id: doneMatchId, game_number: 1, side_a_score: 21, side_b_score: 15 },
    { match_id: doneMatchId, game_number: 2, side_a_score: 21, side_b_score: 18 },
    { match_id: liveMatchId, game_number: 1, side_a_score: 12, side_b_score: 9 },
  ]);
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

describe('findMatchesBoardData', () => {
  test('終わった・進行中・これからの試合が、全部読める', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);

    expect(data.matches.map((m) => m.matchId).sort()).toEqual(
      [doneMatchId, liveMatchId, waitingMatchId, noCourtMatchId, retiredMatchId].sort()
    );
    expect(data.matches.map((m) => m.status).sort()).toEqual([
      'done',
      'done',
      'live',
      'waiting',
      'waiting',
    ]);
    expect(data.truncated).toBe(false);
  });

  test('部（名前と並び順つき）が読める', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);

    expect(data.divisions).toContainEqual({ id: divisionId, name: '1部', sortOrder: 10 });
  });

  test('コート番号・試合順・回戦・両ペアの名前・各ゲームの点数が入っている', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);
    const done = data.matches.find((m) => m.matchId === doneMatchId)!;

    expect(done).toMatchObject({
      courtNumber: 90,
      orderInCourt: 1,
      roundName: '予選 1回戦',
      divisionId,
      maxGameCount: 3,
      ending: 'normal',
    });
    expect(done.sideA.teamNumber).toBe(1);
    expect(done.sideB.teamNumber).toBe(3);
    expect(done.sideA.players.map((p) => p.name).sort()).toEqual(
      [`${tag} 自分`, `${tag} 相方`].sort()
    );
    expect(done.sideB.players.map((p) => p.name)).toEqual([`${tag} 相手`]);
    expect([...done.gameScores].sort((a, b) => a.gameNumber - b.gameNumber)).toEqual([
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 21, sideBScore: 18 },
    ]);
  });

  test('コートが決まっていない試合も読める（コート番号は null）', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);
    const noCourt = data.matches.find((m) => m.matchId === noCourtMatchId)!;

    expect(noCourt.courtNumber).toBeNull();
    expect(noCourt.orderInCourt).toBeNull();
  });

  test('棄権の印（ending）が読める。普通の試合は normal', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);

    expect(data.matches.find((m) => m.matchId === retiredMatchId)!.ending).toBe('retired_side_a');
    expect(data.matches.find((m) => m.matchId === liveMatchId)!.ending).toBe('normal');
  });

  test('自分の participants.id が myParticipantId として読める', async () => {
    const data = await findMatchesBoardData(competitionId, myPlayerId);

    expect(data.myParticipantId).toBe(myParticipantId);
  });

  test('playerId が null（観戦者）のときは myParticipantId が null', async () => {
    const data = await findMatchesBoardData(competitionId, null);

    expect(data.myParticipantId).toBeNull();
  });

  test('ほかの大会の試合は読まない', async () => {
    const other = await admin
      .from('competitions')
      .insert({ name: `${tag} 別の大会`, held_on: '2027-07-02' })
      .select('id')
      .single();
    expect(other.error).toBeNull();

    try {
      const data = await findMatchesBoardData(other.data!.id, null);
      expect(data.matches).toEqual([]);
    } finally {
      await admin.from('competitions').delete().eq('id', other.data!.id);
    }
  });
});

describe('findMatchesBoardData（試合が多い大会）', () => {
  async function withBigCompetition(
    count: number,
    run: (bigCompetitionId: string) => Promise<void>
  ) {
    const big = await admin
      .from('competitions')
      .insert({ name: `${tag} 多い大会`, held_on: '2027-08-01' })
      .select('id')
      .single();
    expect(big.error).toBeNull();
    const bigCompetitionId = big.data!.id;

    try {
      const bigDivision = await admin
        .from('divisions')
        .insert({ competition_id: bigCompetitionId, name: '1部', sort_order: 10 })
        .select('id')
        .single();
      const bigStage = await admin
        .from('stages')
        .insert({
          competition_id: bigCompetitionId,
          name: '予選リーグ',
          format: 'league',
          sort_order: 10,
        })
        .select('id')
        .single();
      const bigMatchup = await admin
        .from('matchups')
        .insert({
          stage_id: bigStage.data!.id,
          round_name: '予選 1回戦',
          side_a_slot_label: '予選1位',
          side_b_slot_label: '予選2位',
        })
        .select('id')
        .single();
      expect(bigMatchup.error, `対戦の作成に失敗: ${bigMatchup.error?.message}`).toBeNull();

      const inserted = await admin.from('matches').insert(
        Array.from({ length: count }, (_, index) => ({
          matchup_id: bigMatchup.data!.id,
          division_id: bigDivision.data!.id,
          order_in_matchup: index + 1,
          status: 'done' as const,
          max_game_count: 1,
          court_number: 1 + (index % 10),
          order_in_court: index + 1,
        }))
      );
      expect(inserted.error, `試合の作成に失敗: ${inserted.error?.message}`).toBeNull();

      await run(bigCompetitionId);
    } finally {
      const { error } = await admin.from('competitions').delete().eq('id', bigCompetitionId);
      if (error) throw new Error(`後片付けに失敗（多い大会）: ${error.message}`);
    }
  }

  test('上限を超えたら、黙って欠けさせず truncated で分かる。超えた 1 件は渡さない', async () => {
    await withBigCompetition(MAX_BOARD_MATCHES + 1, async (bigCompetitionId) => {
      const data = await findMatchesBoardData(bigCompetitionId, null);

      expect(data.truncated).toBe(true);
      expect(data.matches).toHaveLength(MAX_BOARD_MATCHES);
    });
  });

  test('上限ちょうどなら truncated は false（読み切れている）', async () => {
    await withBigCompetition(MAX_BOARD_MATCHES, async (bigCompetitionId) => {
      const data = await findMatchesBoardData(bigCompetitionId, null);

      expect(data.truncated).toBe(false);
      expect(data.matches).toHaveLength(MAX_BOARD_MATCHES);
    });
  });
});
