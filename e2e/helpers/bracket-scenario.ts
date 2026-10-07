import { createClient } from '@supabase/supabase-js';
import { loadTestEnv } from '../../tests/load-env.mjs';
import type { Database } from '@/types/database';

/**
 * /bracket（対戦表）の画面確認に使う試合を、手元のデータベースに用意する。
 *
 * 前は見本データ（`src/ui/bracket/sample-data.ts`）が固定の状態を持っていたが、DB につないだ
 * いまは本物のデータが要る。`e2e/helpers/courts-scenario.ts` と同じやり方で、いまの大会
 * （`supabase/seed.sql` の固定 id）に、テスト用の試合・選手・得点を service_role で足して、
 * 終わったら消す。`is_current` は触らない。
 *
 * **対戦（matchups）は足さない。** seed.sql が作った予選 6 対戦・決勝 4 対戦に、試合を足す。
 * 対戦を足すと困るため:
 * - 予選: 同じチームの組み合わせの対戦が 2 つになり、星取表の 1 マスにどちらが出るか決まらない
 * - 決勝: 決勝の段の対戦がちょうど 4 つのときだけ勝ち上がり表にする（どれが決勝かを並びで決めるため。
 *   仕様の「決勝の見分け方」）。5 つにすると「想定と違う形」の案内になってしまう
 * 足した試合は `order_in_matchup` が 91 以上なので、後片付けで seed の試合と見分けられる。
 *
 * **2 段階に分けている。**
 * - `createBracketScenario` … 予選リーグの結果（終了・引き分け・進行中・未実施）と、決勝の準決勝 2。
 *   ファイル全体で 1 回作って最後まで残す（`test.beforeAll` / `test.afterAll`）。
 * - `createFinishedFinalScenario` … **終わった決勝の対戦**（チーム入り）。順位表が変わらないことを
 *   確かめる test と、優勝の帯を確かめる describe だけで作って、その中だけで消す。
 */

const env = loadTestEnv();
const admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// seed.sql の固定 id（大会・チーム・部・対戦）。
const COMPETITION_ID = 'c0000000-0000-4000-8000-000000000001';
const TEAM_AINAN_ID = '40000000-0000-4000-8000-000000000001'; // 愛知南
const TEAM_CHUO_ID = '40000000-0000-4000-8000-000000000002'; // 愛知中央
const TEAM_AIHOKU_ID = '40000000-0000-4000-8000-000000000003'; // 愛知北
const TEAM_AISEI_ID = '40000000-0000-4000-8000-000000000004'; // 愛知西
const DIVISION_1_ID = 'd0000000-0000-4000-8000-000000000001'; // 1部
const DIVISION_2_ID = 'd0000000-0000-4000-8000-000000000002'; // 2部

/** 予選の総当たり 6 対戦（seed.sql）。A 側 - B 側 は seed.sql のとおり。 */
const LEAGUE_HOKU_SEI = '60000000-0000-4000-8000-000000000002'; // 愛知北 - 愛知西
const LEAGUE_NAN_HOKU = '60000000-0000-4000-8000-000000000003'; // 愛知南 - 愛知北
const LEAGUE_CHUO_SEI = '60000000-0000-4000-8000-000000000004'; // 愛知中央 - 愛知西
const LEAGUE_NAN_SEI = '60000000-0000-4000-8000-000000000005'; // 愛知南 - 愛知西
/** 愛知中央 - 愛知北（000006）は試合を足さない（試合が 1 つも無い対戦 =「未」）。 */

/** 決勝の 4 対戦（seed.sql）。sort_order の順に 準決勝1・準決勝2・決勝・3位決定戦。 */
const KNOCKOUT_SEMIFINAL_1 = '60000000-0000-4000-8000-000000000011';
const KNOCKOUT_SEMIFINAL_2 = '60000000-0000-4000-8000-000000000012';
const KNOCKOUT_FINAL = '60000000-0000-4000-8000-000000000013';
const KNOCKOUT_THIRD_PLACE = '60000000-0000-4000-8000-000000000014';

/** seed.sql の対戦すべて（予選 6・決勝 4）。試合を足すのも、余計な対戦が無いかを見るのもこの一覧。 */
const ALL_MATCHUP_IDS = [
  '60000000-0000-4000-8000-000000000001',
  LEAGUE_HOKU_SEI,
  LEAGUE_NAN_HOKU,
  LEAGUE_CHUO_SEI,
  LEAGUE_NAN_SEI,
  '60000000-0000-4000-8000-000000000006',
  KNOCKOUT_SEMIFINAL_1,
  KNOCKOUT_SEMIFINAL_2,
  KNOCKOUT_FINAL,
  KNOCKOUT_THIRD_PLACE,
];
const KNOCKOUT_MATCHUP_IDS = [
  KNOCKOUT_SEMIFINAL_1,
  KNOCKOUT_SEMIFINAL_2,
  KNOCKOUT_FINAL,
  KNOCKOUT_THIRD_PLACE,
];

/** 勝ち上がり表の枠の `data-testid` は `ko-match-<対戦の id>`。 */
export const KO_BOX_TEST_IDS = {
  semifinal1: `ko-match-${KNOCKOUT_SEMIFINAL_1}`,
  semifinal2: `ko-match-${KNOCKOUT_SEMIFINAL_2}`,
  final: `ko-match-${KNOCKOUT_FINAL}`,
  thirdPlace: `ko-match-${KNOCKOUT_THIRD_PLACE}`,
} as const;

/** seed.sql（1〜16, 99）・長い名前（899801〜）・db テスト（8999 台前半）・courts-scenario（899951〜）とぶつからない番号。 */
const PLAYER_NUMBERS = [899971, 899972, 899973, 899974] as const;
const [HOKU_1, HOKU_2, SEI_1, SEI_2] = PLAYER_NUMBERS;

/** 足した試合を seed の試合（1〜3）と見分けるための下限。 */
const ADDED_MATCH_ORDER_START = 91;

// ---------------------------------------------------------------------
// 画面で確かめるときに使う名前（test と helper で食い違わないよう、ここに置く）
// ---------------------------------------------------------------------

export const TEAM_NAMES = {
  nan: '愛知南',
  chuo: '愛知中央',
  hoku: '愛知北',
  sei: '愛知西',
} as const;

/** 愛知北 - 愛知西 の試合に出る人（詳細シートの名前の確認用）。 */
export const HOKU_SEI_PAIR_NAMES = {
  hoku: ['岡田', '石川'],
  sei: ['藤田', '後藤'],
} as const;
const PLAYER_NAMES: Record<(typeof PLAYER_NUMBERS)[number], string> = {
  [HOKU_1]: HOKU_SEI_PAIR_NAMES.hoku[0],
  [HOKU_2]: HOKU_SEI_PAIR_NAMES.hoku[1],
  [SEI_1]: HOKU_SEI_PAIR_NAMES.sei[0],
  [SEI_2]: HOKU_SEI_PAIR_NAMES.sei[1],
};

/** 決勝で勝つチーム。予選の順位が変わってしまうチームにしてある（数えてしまえば順位表が動く）。 */
export const FINAL_WINNER_TEAM_NAME = TEAM_NAMES.chuo;

/** 空のまま残す決勝の枠（seed.sql の空枠の名前）。 */
export const EMPTY_SLOT_LABELS = ['予選1位', '予選4位', '準決勝1 敗者', '準決勝2 敗者'] as const;

type MatchStatus = 'done' | 'live' | 'waiting';

type MatchSpec = {
  matchupId: string;
  divisionId: string;
  status: MatchStatus;
  maxGameCount: number;
  /** 第 1 ゲームの [A の得点, B の得点]。まだなら null。 */
  score: [number, number] | null;
  withPlayers?: boolean;
};

/** 予選: 試合の上限は 1 ゲーム。 */
function leagueMatch(
  matchupId: string,
  divisionId: string,
  status: MatchStatus,
  score: [number, number] | null,
  withPlayers = false
): MatchSpec {
  return { matchupId, divisionId, status, maxGameCount: 1, score, withPlayers };
}

/** 決勝: 試合の上限は 3 ゲーム。 */
function knockoutMatch(
  matchupId: string,
  status: MatchStatus,
  score: [number, number] | null
): MatchSpec {
  return { matchupId, divisionId: DIVISION_1_ID, status, maxGameCount: 3, score };
}

/**
 * 足す試合の一覧。
 *
 * 星取表のマスの結果（行チームから見て）:
 * - 愛知北 - 愛知西 … 2 試合とも A（愛知北）の勝ち → 愛知北 ○ 2-0 / 愛知西 ● 0-2
 * - 愛知南 - 愛知北 … 1 勝 1 敗 → 引き分け △ 1-1
 * - 愛知中央 - 愛知西 … 1 試合終了・1 試合まだ → 試合中 1-0
 * - 愛知南 - 愛知西 … 2 試合とも B（愛知西）の勝ち → 愛知西 ○ 2-0 / 愛知南 ● 0-2
 * - 愛知中央 - 愛知北 … 試合なし → 未
 */
const LEAGUE_MATCHES: MatchSpec[] = [
  leagueMatch(LEAGUE_HOKU_SEI, DIVISION_1_ID, 'done', [21, 10], true),
  leagueMatch(LEAGUE_HOKU_SEI, DIVISION_2_ID, 'done', [21, 12], true),
  leagueMatch(LEAGUE_NAN_HOKU, DIVISION_1_ID, 'done', [21, 10]),
  leagueMatch(LEAGUE_NAN_HOKU, DIVISION_2_ID, 'done', [10, 21]),
  leagueMatch(LEAGUE_CHUO_SEI, DIVISION_1_ID, 'done', [21, 10]),
  leagueMatch(LEAGUE_CHUO_SEI, DIVISION_2_ID, 'waiting', null),
  leagueMatch(LEAGUE_NAN_SEI, DIVISION_1_ID, 'done', [10, 21]),
  leagueMatch(LEAGUE_NAN_SEI, DIVISION_2_ID, 'done', [10, 21]),
];

/** 準決勝2 は愛知南 対 愛知北: 1 試合終了・1 試合進行中 → 試合中 1-0。 */
const SEMIFINAL_2_MATCHES: MatchSpec[] = [
  knockoutMatch(KNOCKOUT_SEMIFINAL_2, 'done', [21, 10]),
  knockoutMatch(KNOCKOUT_SEMIFINAL_2, 'live', [5, 3]),
];

/** 決勝は愛知中央 対 愛知西: 愛知中央の勝ちで終了 → 優勝は愛知中央。 */
const FINAL_MATCHES: MatchSpec[] = [knockoutMatch(KNOCKOUT_FINAL, 'done', [21, 0])];

async function insertMatches(
  specs: MatchSpec[],
  participantIdByPlayerNumber: Map<number, string> | null
): Promise<void> {
  const nextOrderByMatchup = new Map<string, number>();
  const rows = specs.map((spec) => {
    const order = nextOrderByMatchup.get(spec.matchupId) ?? ADDED_MATCH_ORDER_START;
    nextOrderByMatchup.set(spec.matchupId, order + 1);
    return {
      matchup_id: spec.matchupId,
      division_id: spec.divisionId,
      order_in_matchup: order,
      status: spec.status,
      max_game_count: spec.maxGameCount,
    };
  });
  const inserted = await admin.from('matches').insert(rows).select('id');
  if (inserted.error) throw new Error(`試合を作れませんでした: ${inserted.error.message}`);

  // insert の返す並びは入れた並び（rows と同じ長さ・順）
  const scores = specs.flatMap((spec, index) =>
    spec.score
      ? [
          {
            match_id: inserted.data[index].id,
            game_number: 1,
            side_a_score: spec.score[0],
            side_b_score: spec.score[1],
          },
        ]
      : []
  );
  if (scores.length > 0) {
    const result = await admin.from('game_scores').insert(scores);
    if (result.error) throw new Error(`得点を作れませんでした: ${result.error.message}`);
  }

  if (!participantIdByPlayerNumber) return;
  const participantOf = (playerNumber: number) => participantIdByPlayerNumber.get(playerNumber)!;
  const players = specs.flatMap((spec, index) =>
    spec.withPlayers
      ? [
          { side: 'a', participant_id: participantOf(HOKU_1), order_in_pair: 1 },
          { side: 'a', participant_id: participantOf(HOKU_2), order_in_pair: 2 },
          { side: 'b', participant_id: participantOf(SEI_1), order_in_pair: 1 },
          { side: 'b', participant_id: participantOf(SEI_2), order_in_pair: 2 },
        ].map((row) => ({ ...row, match_id: inserted.data[index].id }))
      : []
  );
  if (players.length > 0) {
    const result = await admin.from('match_players').insert(players);
    if (result.error) throw new Error(`出場者を作れませんでした: ${result.error.message}`);
  }
}

async function setKnockoutTeams(
  matchupId: string,
  sideATeamId: string | null,
  sideBTeamId: string | null
): Promise<void> {
  const { error } = await admin
    .from('matchups')
    .update({ side_a_team_id: sideATeamId, side_b_team_id: sideBTeamId })
    .eq('id', matchupId);
  if (error) throw new Error(`決勝の対戦にチームを入れられませんでした: ${error.message}`);
}

/**
 * いまの大会の対戦が、seed.sql の予選 6・決勝 4 の**ちょうど 10 個だけ**であること。
 *
 * 足りなくても、余計にあっても、このファイルの確かめ方が成り立たない。特に別の e2e
 * （courts-scenario・long-name-player は同じ大会に対戦を足す）が途中で止まって残した対戦があると、
 * 決勝が 5 つになって勝ち上がり表が「想定と違う形」になり、どの test も「見つからない」で落ちて
 * 理由が分からない。先にここで、理由の分かる言葉で止める。
 */
async function assertOnlySeedMatchups(): Promise<void> {
  const { data, error } = await admin
    .from('matchups')
    .select('id, stages!inner(competition_id)')
    .eq('stages.competition_id', COMPETITION_ID)
    .limit(ALL_MATCHUP_IDS.length + 1);
  if (error) throw new Error(`seed の対戦を確認できませんでした: ${error.message}`);

  const ids = data.map((row) => row.id);
  const missing = ALL_MATCHUP_IDS.filter((id) => !ids.includes(id));
  if (missing.length > 0) {
    throw new Error('seed.sql の予選・決勝の対戦が見つかりません。npm run db:reset をしてください');
  }
  if (ids.length > ALL_MATCHUP_IDS.length) {
    throw new Error(
      'いまの大会に seed 以外の対戦が残っています（別の e2e の後片付け漏れ）。npm run db:reset をしてください'
    );
  }
}

// ---------------------------------------------------------------------
// 基本シナリオ（予選リーグの結果と、決勝の準決勝 2。ファイル全体で 1 回作って最後まで残す）
// ---------------------------------------------------------------------

export async function createBracketScenario(): Promise<void> {
  // 前回が途中で止まって seed を書き換えたまま残っていても、作る前に必ず元に戻す
  // （courts-scenario と同じ「作る前に消す」）。
  await restoreSeedState();
  await assertOnlySeedMatchups();

  const players = await admin
    .from('players')
    .insert(PLAYER_NUMBERS.map((number) => ({ player_number: number, name: PLAYER_NAMES[number] })))
    .select('id, player_number');
  if (players.error) throw new Error(`選手を作れませんでした: ${players.error.message}`);
  const playerIdByNumber = new Map(players.data.map((row) => [row.player_number, row.id]));

  const teamOf = (playerNumber: number) =>
    playerNumber === HOKU_1 || playerNumber === HOKU_2 ? TEAM_AIHOKU_ID : TEAM_AISEI_ID;
  const participants = await admin
    .from('participants')
    .insert(
      PLAYER_NUMBERS.map((playerNumber) => ({
        competition_id: COMPETITION_ID,
        player_id: playerIdByNumber.get(playerNumber)!,
        team_id: teamOf(playerNumber),
      }))
    )
    .select('id, player_id');
  if (participants.error)
    throw new Error(`参加者を作れませんでした: ${participants.error.message}`);
  const participantIdByPlayerNumber = new Map(
    PLAYER_NUMBERS.map((playerNumber) => [
      playerNumber,
      participants.data.find((row) => row.player_id === playerIdByNumber.get(playerNumber))!.id,
    ])
  );

  await insertMatches([...LEAGUE_MATCHES, ...SEMIFINAL_2_MATCHES], participantIdByPlayerNumber);
  // 準決勝2 だけチームを入れる。空枠の名前（seed.sql の予選2位など）は残したままにして、
  // 「チームが入っていればチーム名が出る」ことも確かめる。他の 3 つは空枠のまま。
  await setKnockoutTeams(KNOCKOUT_SEMIFINAL_2, TEAM_AINAN_ID, TEAM_AIHOKU_ID);
}

/** 足した試合・選手を消し、決勝に入れたチームを空に戻す。seed の試合には触らない。 */
export async function deleteBracketScenario(): Promise<void> {
  await restoreSeedState();
}

/**
 * このシナリオが seed に足した・書き換えたものを、seed.sql の値に戻して、戻ったことを確かめる。
 * - 足した試合（order_in_matchup が 91 以上）と、足した選手を消す
 * - 決勝 4 対戦の side_a/b_team_id を null に戻す（seed.sql では空枠の名前だけで、チームは入っていない）
 * 作る前と、終わったあとの両方で呼ぶ。戻っていなければ、黙って進まず落とす。
 */
async function restoreSeedState(): Promise<void> {
  const matches = await admin
    .from('matches')
    .delete()
    .gte('order_in_matchup', ADDED_MATCH_ORDER_START)
    .in('matchup_id', ALL_MATCHUP_IDS);
  if (matches.error) throw new Error(`後片付けに失敗（試合）: ${matches.error.message}`);

  const teams = await admin
    .from('matchups')
    .update({ side_a_team_id: null, side_b_team_id: null })
    .in('id', KNOCKOUT_MATCHUP_IDS);
  if (teams.error) throw new Error(`後片付けに失敗（決勝のチーム）: ${teams.error.message}`);

  const players = await admin.from('players').delete().in('player_number', PLAYER_NUMBERS);
  if (players.error) throw new Error(`後片付けに失敗（選手）: ${players.error.message}`);

  await assertSeedStateRestored();
}

async function assertSeedStateRestored(): Promise<void> {
  const left = await admin
    .from('matches')
    .select('id')
    .gte('order_in_matchup', ADDED_MATCH_ORDER_START)
    .in('matchup_id', ALL_MATCHUP_IDS);
  if (left.error) throw new Error(`戻ったかを確認できませんでした（試合）: ${left.error.message}`);
  if (left.data.length > 0) {
    throw new Error(`足した試合が ${left.data.length} 件、消えずに残っています`);
  }

  const knockout = await admin
    .from('matchups')
    .select('id, side_a_team_id, side_b_team_id')
    .in('id', KNOCKOUT_MATCHUP_IDS);
  if (knockout.error) {
    throw new Error(`戻ったかを確認できませんでした（決勝）: ${knockout.error.message}`);
  }
  const stillFilled = knockout.data.filter((row) => row.side_a_team_id || row.side_b_team_id);
  if (stillFilled.length > 0) {
    throw new Error(`決勝の対戦 ${stillFilled.length} 件に、チームが入ったまま残っています`);
  }

  const players = await admin.from('players').select('id').in('player_number', PLAYER_NUMBERS);
  if (players.error) {
    throw new Error(`戻ったかを確認できませんでした（選手）: ${players.error.message}`);
  }
  if (players.data.length > 0) {
    throw new Error(`テスト用の選手が ${players.data.length} 人、消えずに残っています`);
  }
}

// ---------------------------------------------------------------------
// 終わった決勝（順位表が変わらないことと、優勝の帯を確かめる分だけで作る）
// ---------------------------------------------------------------------

/**
 * 決勝の対戦にチーム（愛知中央 対 愛知西）を入れ、愛知中央が勝って終わった試合を足す。
 * 予選の順位表に数えられてしまうと、愛知中央と愛知西の勝敗が動く。
 */
export async function createFinishedFinalScenario(): Promise<void> {
  await deleteFinishedFinalScenario();
  await setKnockoutTeams(KNOCKOUT_FINAL, TEAM_CHUO_ID, TEAM_AISEI_ID);
  await insertMatches(FINAL_MATCHES, null);
}

export async function deleteFinishedFinalScenario(): Promise<void> {
  const { error } = await admin
    .from('matches')
    .delete()
    .gte('order_in_matchup', ADDED_MATCH_ORDER_START)
    .eq('matchup_id', KNOCKOUT_FINAL);
  if (error) throw new Error(`後片付けに失敗（決勝の試合）: ${error.message}`);

  await setKnockoutTeams(KNOCKOUT_FINAL, null, null);
}
