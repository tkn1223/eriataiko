import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import { findBracketData, MAX_MATCHES_PER_MATCHUP, MAX_MATCHUPS_PER_STAGE } from '@/db/bracket';

/**
 * `findBracketData` を本物のデータベースに当てて確かめる。
 *
 * `build-bracket-view.test.ts` は組み立てのロジックを偽物の入力で確かめている。
 * ここでしか分からないのは**実際の表からどう読み出すか**。
 *
 * `src/db/courts.test.ts` と同じやり方で、自分が作った大会の id をそのまま渡す
 * （共有の「いまの大会」には触らないので、他のテストと同時に流しても競合しない）。
 *
 * 実行前に `npm run db:start` が必要。
 */

const admin = getSupabaseAdminClient();

const tag = `test-bracket-${Math.random().toString(36).slice(2, 10)}`;

let competitionId: string;
let divisionId: string;
let teamAId: string;
let teamBId: string;
let leagueMatchupId: string;
let knockoutMatchupId: string;
let myPlayerId: string;
let noTeamPlayerId: string;
let doneMatchId: string;
let liveMatchId: string;

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
      { competition_id: competitionId, team_number: 3, name: `${tag} チームB`, sort_order: 20 },
      { competition_id: competitionId, team_number: 1, name: `${tag} チームA`, sort_order: 10 },
    ])
    .select('id, team_number');
  expect(teams.error, `チームの作成に失敗: ${teams.error?.message}`).toBeNull();
  teamAId = teams.data!.find((t) => t.team_number === 1)!.id;
  teamBId = teams.data!.find((t) => t.team_number === 3)!.id;

  const stages = await admin
    .from('stages')
    .insert([
      {
        competition_id: competitionId,
        name: '決勝トーナメント',
        format: 'knockout',
        sort_order: 20,
      },
      { competition_id: competitionId, name: '予選リーグ', format: 'league', sort_order: 10 },
    ])
    .select('id, format');
  expect(stages.error, `段の作成に失敗: ${stages.error?.message}`).toBeNull();
  const leagueStageId = stages.data!.find((s) => s.format === 'league')!.id;
  const knockoutStageId = stages.data!.find((s) => s.format === 'knockout')!.id;

  const matchups = await admin
    .from('matchups')
    .insert([
      {
        stage_id: leagueStageId,
        round_name: '予選 1回戦',
        side_a_team_id: teamAId,
        side_b_team_id: teamBId,
        sort_order: 10,
      },
      {
        stage_id: knockoutStageId,
        round_name: '準決勝1',
        side_a_team_id: teamAId,
        side_b_slot_label: '予選4位',
        sort_order: 10,
      },
    ])
    .select('id, round_name');
  expect(matchups.error, `対戦の作成に失敗: ${matchups.error?.message}`).toBeNull();
  leagueMatchupId = matchups.data!.find((m) => m.round_name === '予選 1回戦')!.id;
  knockoutMatchupId = matchups.data!.find((m) => m.round_name === '準決勝1')!.id;

  const players = await admin
    .from('players')
    .insert([
      { player_number: 899931, name: `${tag} 自分` },
      { player_number: 899932, name: `${tag} 相方` },
      { player_number: 899933, name: `${tag} 相手` },
      { player_number: 899934, name: `${tag} 入力係` },
    ])
    .select('id, player_number');
  expect(players.error, `選手の作成に失敗: ${players.error?.message}`).toBeNull();
  const playerId = (number: number) => players.data!.find((p) => p.player_number === number)!.id;
  myPlayerId = playerId(899931);
  noTeamPlayerId = playerId(899934);

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
        player_id: playerId(899932),
        team_id: teamAId,
        division_id: divisionId,
      },
      {
        competition_id: competitionId,
        player_id: playerId(899933),
        team_id: teamBId,
        division_id: divisionId,
      },
      // 試合に出ない入力係（チームも部も空）
      { competition_id: competitionId, player_id: noTeamPlayerId },
    ])
    .select('id, player_id');
  expect(participants.error, `参加者の作成に失敗: ${participants.error?.message}`).toBeNull();
  const participantId = (id: string) => participants.data!.find((p) => p.player_id === id)!.id;

  const matches = await admin
    .from('matches')
    .insert([
      {
        matchup_id: leagueMatchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'done',
        max_game_count: 1,
      },
      {
        matchup_id: leagueMatchupId,
        division_id: divisionId,
        order_in_matchup: 2,
        status: 'live',
        max_game_count: 1,
      },
      {
        matchup_id: knockoutMatchupId,
        division_id: divisionId,
        order_in_matchup: 1,
        status: 'waiting',
        max_game_count: 3,
      },
    ])
    .select('id, status');
  expect(matches.error, `試合の作成に失敗: ${matches.error?.message}`).toBeNull();
  doneMatchId = matches.data!.find((m) => m.status === 'done')!.id;
  liveMatchId = matches.data!.find((m) => m.status === 'live')!.id;

  const matchPlayers = await admin.from('match_players').insert([
    {
      match_id: doneMatchId,
      side: 'a',
      participant_id: participantId(myPlayerId),
      order_in_pair: 1,
    },
    {
      match_id: doneMatchId,
      side: 'a',
      participant_id: participantId(playerId(899932)),
      order_in_pair: 2,
    },
    {
      match_id: doneMatchId,
      side: 'b',
      participant_id: participantId(playerId(899933)),
      order_in_pair: 1,
    },
  ]);
  expect(matchPlayers.error, `出場者の作成に失敗: ${matchPlayers.error?.message}`).toBeNull();

  const gameScores = await admin.from('game_scores').insert([
    { match_id: doneMatchId, game_number: 1, side_a_score: 21, side_b_score: 15 },
    { match_id: liveMatchId, game_number: 1, side_a_score: 8, side_b_score: 6 },
  ]);
  expect(gameScores.error, `得点の作成に失敗: ${gameScores.error?.message}`).toBeNull();
});

afterAll(async () => {
  const { error } = await admin.from('competitions').delete().eq('id', competitionId);
  if (error) throw new Error(`後片付けに失敗（大会）: ${error.message}`);

  const { error: playersError } = await admin
    .from('players')
    .delete()
    .in('player_number', [899931, 899932, 899933, 899934]);
  if (playersError) throw new Error(`後片付けに失敗（選手）: ${playersError.message}`);
});

describe('findBracketData', () => {
  test('チームが sort_order の順に、チーム番号と名前つきで読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);

    expect(data.teams.map((t) => [t.teamNumber, t.name])).toEqual([
      [1, `${tag} チームA`],
      [3, `${tag} チームB`],
    ]);
    expect(data.truncated).toBe(false);
  });

  test('部が名前・並び順つきで読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);

    expect(data.divisions).toEqual([{ id: divisionId, name: '1部', sortOrder: 10 }]);
  });

  test('予選と決勝の両方の対戦が、段の種類・並びつきで読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);

    const league = data.matchups.find((m) => m.id === leagueMatchupId)!;
    const knockout = data.matchups.find((m) => m.id === knockoutMatchupId)!;
    expect(league).toMatchObject({
      stageFormat: 'league',
      stageSortOrder: 10,
      roundName: '予選 1回戦',
      sideATeamId: teamAId,
      sideBTeamId: teamBId,
      sideASlotLabel: null,
    });
    expect(knockout).toMatchObject({
      stageFormat: 'knockout',
      stageSortOrder: 20,
      sideATeamId: teamAId,
      sideBTeamId: null,
      sideBSlotLabel: '予選4位',
    });
  });

  test('対戦の中の試合が、状態・上限ゲーム数・出場者の名前・得点つきで読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);
    const league = data.matchups.find((m) => m.id === leagueMatchupId)!;

    expect(league.matches.map((m) => [m.orderInMatchup, m.status, m.maxGameCount])).toEqual([
      [1, 'done', 1],
      [2, 'live', 1],
    ]);
    const done = league.matches.find((m) => m.id === doneMatchId)!;
    expect(done.divisionId).toBe(divisionId);
    expect(done.players.map((p) => [p.side, p.orderInPair, p.name]).sort()).toEqual(
      [
        ['a', 1, `${tag} 自分`],
        ['a', 2, `${tag} 相方`],
        ['b', 1, `${tag} 相手`],
      ].sort()
    );
    expect(done.gameScores).toEqual([{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }]);
  });

  test('出場者も得点もまだ無い試合は、空の一覧で読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);
    const knockout = data.matchups.find((m) => m.id === knockoutMatchupId)!;

    expect(knockout.matches).toHaveLength(1);
    expect(knockout.matches[0].players).toEqual([]);
    expect(knockout.matches[0].gameScores).toEqual([]);
  });

  test('自分のチームの teams.id が myTeamId として読める', async () => {
    const data = await findBracketData(competitionId, myPlayerId);

    expect(data.myTeamId).toBe(teamAId);
  });

  test('playerId が null（観戦者）のときは myTeamId が null', async () => {
    const data = await findBracketData(competitionId, null);

    expect(data.myTeamId).toBeNull();
  });

  test('チームに入っていない参加者（入力係）の myTeamId は null', async () => {
    const data = await findBracketData(competitionId, noTeamPlayerId);

    expect(data.myTeamId).toBeNull();
  });

  test('指定した大会にその人の参加者情報が無ければ myTeamId は null', async () => {
    const noSuchPlayer = await admin
      .from('players')
      .insert({ player_number: 899939, name: `${tag} 出ない人` })
      .select('id')
      .single();
    expect(noSuchPlayer.error).toBeNull();

    try {
      const data = await findBracketData(competitionId, noSuchPlayer.data!.id);
      expect(data.myTeamId).toBeNull();
    } finally {
      await admin.from('players').delete().eq('id', noSuchPlayer.data!.id);
    }
  });
});

/** 大きな大会。上限を超えたら黙って欠けさせず、truncated で分かる。 */
describe('findBracketData（上限）', () => {
  async function withBigCompetition(
    matchupCount: number,
    matchesPerMatchup: number,
    run: (bigCompetitionId: string) => Promise<void>
  ) {
    const bigCompetition = await admin
      .from('competitions')
      .insert({ name: `${tag} 多い大会`, held_on: '2027-06-01' })
      .select('id')
      .single();
    expect(bigCompetition.error).toBeNull();
    const bigCompetitionId = bigCompetition.data!.id;

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
      const bigMatchups = await admin
        .from('matchups')
        .insert(
          Array.from({ length: matchupCount }, (_, index) => ({
            stage_id: bigStage.data!.id,
            round_name: `予選 ${index + 1}回戦`,
            side_a_slot_label: '予選1位',
            side_b_slot_label: '予選2位',
            sort_order: index + 1,
          }))
        )
        .select('id');
      expect(bigMatchups.error, `対戦の作成に失敗: ${bigMatchups.error?.message}`).toBeNull();

      const rows = bigMatchups.data!.flatMap((matchup) =>
        Array.from({ length: matchesPerMatchup }, (_, index) => ({
          matchup_id: matchup.id,
          division_id: bigDivision.data!.id,
          order_in_matchup: index + 1,
          status: 'waiting',
          max_game_count: 1,
        }))
      );
      const inserted = await admin.from('matches').insert(rows);
      expect(inserted.error, `試合の作成に失敗: ${inserted.error?.message}`).toBeNull();

      await run(bigCompetitionId);
    } finally {
      const { error } = await admin.from('competitions').delete().eq('id', bigCompetitionId);
      if (error) throw new Error(`後片付けに失敗（多い大会）: ${error.message}`);
    }
  }

  test('1 段の対戦が上限を超えたら truncated になり、上限までしか渡さない', async () => {
    await withBigCompetition(MAX_MATCHUPS_PER_STAGE + 1, 1, async (bigCompetitionId) => {
      const data = await findBracketData(bigCompetitionId, null);

      expect(data.truncated).toBe(true);
      expect(data.matchups).toHaveLength(MAX_MATCHUPS_PER_STAGE);
    });
  });

  test('上限ちょうどの対戦数なら truncated は false', async () => {
    await withBigCompetition(MAX_MATCHUPS_PER_STAGE, 1, async (bigCompetitionId) => {
      const data = await findBracketData(bigCompetitionId, null);

      expect(data.truncated).toBe(false);
      expect(data.matchups).toHaveLength(MAX_MATCHUPS_PER_STAGE);
    });
  });

  test('1 つの対戦の中の試合が上限を超えたら truncated になり、上限までしか渡さない', async () => {
    await withBigCompetition(1, MAX_MATCHES_PER_MATCHUP + 1, async (bigCompetitionId) => {
      const data = await findBracketData(bigCompetitionId, null);

      expect(data.truncated).toBe(true);
      expect(data.matchups[0].matches).toHaveLength(MAX_MATCHES_PER_MATCHUP);
    });
  });
});
