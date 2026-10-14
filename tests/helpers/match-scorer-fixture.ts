import { expect } from 'vitest';
import { getSupabaseAdminClient } from '@/db/admin';
import type { PlayerSession } from '@/server/session';

/**
 * 入力担当の入口（Route Handler）のテストが使う、本物の DB に作る小さな大会。
 *
 * 大会・チーム・参加者 3 人（同じ名前の「たろう」が 2 人いるチーム違い、とチームの無い人）・
 * 試合をいくつか作り、`dispose` で大会ごと消す。
 * 入場している人（セッション）は、この参加者の人に合わせた偽物を渡す。
 */
export type ScorerFixture = {
  tag: string;
  /** 新しい進行中の試合を 1 つ作って id を返す（テストごとに別の試合を使い、担当の状態を引きずらない）。 */
  makeMatch: (status?: 'waiting' | 'live' | 'done') => Promise<string>;
  /** 愛知南のたろう / 愛知北のたろう（同名）/ 本部（チームなし）。 */
  people: Record<'minamiTaro' | 'kitaTaro' | 'honbu', FixturePerson>;
  /** 参加者でない人（登録のない入場）。 */
  stranger: PlayerSession;
  dispose: () => Promise<void>;
};

export type FixturePerson = {
  participantId: string;
  session: PlayerSession;
  /** 画面に出す名前（「さん」なし）。 */
  label: string;
};

export async function createScorerFixture(playerNumberBase: number): Promise<ScorerFixture> {
  const admin = getSupabaseAdminClient();
  const tag = `scorer-${Math.random().toString(36).slice(2, 8)}`;

  const competition = await admin
    .from('competitions')
    .insert({ name: `${tag} 大会`, held_on: '2027-03-14' })
    .select('id')
    .single();
  expect(competition.error, `大会の作成に失敗: ${competition.error?.message}`).toBeNull();
  const competitionId = competition.data!.id;

  const teams = await admin
    .from('teams')
    .insert([
      { competition_id: competitionId, team_number: 1, name: '愛知南' },
      { competition_id: competitionId, team_number: 2, name: '愛知北' },
    ])
    .select('id, team_number');
  const teamIdOf = (number: number) => teams.data!.find((row) => row.team_number === number)!.id;

  const players = await admin
    .from('players')
    .insert([
      { player_number: playerNumberBase, name: 'たろう' },
      { player_number: playerNumberBase + 1, name: 'たろう' },
      { player_number: playerNumberBase + 2, name: '本部' },
      { player_number: playerNumberBase + 3, name: `${tag}参加していない人` },
    ])
    .select('id, player_number');
  expect(players.error, `選手の作成に失敗: ${players.error?.message}`).toBeNull();
  const playerOf = (offset: number) =>
    players.data!.find((row) => row.player_number === playerNumberBase + offset)!;

  const participants = await admin
    .from('participants')
    .insert([
      { competition_id: competitionId, player_id: playerOf(0).id, team_id: teamIdOf(1) },
      { competition_id: competitionId, player_id: playerOf(1).id, team_id: teamIdOf(2) },
      { competition_id: competitionId, player_id: playerOf(2).id },
    ])
    .select('id, player_id');
  expect(participants.error, `参加者の作成に失敗: ${participants.error?.message}`).toBeNull();
  const participantIdOf = (offset: number) =>
    participants.data!.find((row) => row.player_id === playerOf(offset).id)!.id;

  const sessionOf = (offset: number, name: string): PlayerSession => ({
    role: 'player',
    playerId: playerOf(offset).id,
    // 記録（write_logs）から、このテストの出来事だけを探せるよう、名前に印を付ける
    playerName: `${tag}-${name}`,
    playerNumber: playerNumberBase + offset,
  });

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

  let orderInMatchup = 0;
  return {
    tag,
    people: {
      minamiTaro: {
        participantId: participantIdOf(0),
        session: sessionOf(0, '南たろう'),
        label: '愛知南のたろう',
      },
      kitaTaro: {
        participantId: participantIdOf(1),
        session: sessionOf(1, '北たろう'),
        label: '愛知北のたろう',
      },
      honbu: {
        participantId: participantIdOf(2),
        session: sessionOf(2, '本部'),
        label: '本部',
      },
    },
    stranger: sessionOf(3, '参加していない人'),
    async makeMatch(status = 'live') {
      orderInMatchup += 1;
      const match = await admin
        .from('matches')
        .insert({
          matchup_id: matchup.data!.id,
          division_id: division.data!.id,
          order_in_matchup: orderInMatchup,
          max_game_count: 3,
          status,
        })
        .select('id')
        .single();
      expect(match.error, `試合の作成に失敗: ${match.error?.message}`).toBeNull();
      return match.data!.id;
    },
    async dispose() {
      const removedCompetition = await admin.from('competitions').delete().eq('id', competitionId);
      if (removedCompetition.error) {
        throw new Error(`後片付けに失敗（大会）: ${removedCompetition.error.message}`);
      }
      const removedPlayers = await admin
        .from('players')
        .delete()
        .gte('player_number', playerNumberBase)
        .lte('player_number', playerNumberBase + 3);
      if (removedPlayers.error) {
        throw new Error(`後片付けに失敗（人）: ${removedPlayers.error.message}`);
      }
      await admin.from('write_logs').delete().like('player_name', `${tag}-%`);
    },
  };
}
