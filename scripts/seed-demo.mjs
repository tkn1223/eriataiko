// 画面づくり用のテストデータを入れる。**本番のデータベースに書き込む。**
//
// 使い方:
//   node --env-file=.env.local scripts/seed-demo.mjs
//
// 鍵はこのファイルに書かない。環境変数から読む:
//   NEXT_PUBLIC_SUPABASE_URL   … どのデータベースか
//   SUPABASE_SERVICE_ROLE_KEY  … 書き込める鍵（秘密。git に入れない）
//
// **URL を間違えると本番を触る。** 手元で試すなら 127.0.0.1 を指す .env.local を使うこと。
//
// 入れたものを消すのは scripts/remove-demo.mjs。目印はこの 3 つだけ:
//   1. 段（予選リーグ / 決勝トーナメント）
//   2. 選手番号 101〜118
//   3. チーム「関西」
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要ります。');
  console.error('例: node --env-file=.env.local scripts/seed-demo.mjs');
  process.exit(1);
}
console.log(`つなぐ先: ${url}`);
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const ins = async (table, rows) => {
  const { data, error } = await db.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${data.length} 件`);
  return data;
};
const one = (rows, pred) => {
  const hit = rows.find(pred);
  if (!hit) throw new Error('見つからない');
  return hit;
};

// ---- いま入っているものを読む ----
const { data: comp } = await db.from('competitions').select('*').eq('is_current', true).single();
const { data: divisions } = await db.from('divisions').select('*').eq('competition_id', comp.id);
const { data: teams0 } = await db.from('teams').select('*').eq('competition_id', comp.id);
const { data: players0 } = await db.from('players').select('*');
const { data: parts0 } = await db.from('participants').select('*').eq('competition_id', comp.id);
console.log(
  `大会: ${comp.name} / 部 ${divisions.length} / チーム ${teams0.length} / 選手 ${players0.length}`
);

if (players0.some((p) => p.player_number >= 101 && p.player_number <= 118)) {
  throw new Error('すでにテストデータが入っています。先に remove-demo.mjs を実行してください。');
}

const div = (name) => one(divisions, (d) => d.name === name).id;

// ---- 1. チーム「関西」を足す（4 チームにする。色は 4 まで） ----
console.log('チーム');
const kansai = (
  await ins('teams', [{ competition_id: comp.id, team_number: 4, name: '関西', sort_order: 40 }])
)[0];
const teams = [...teams0, kansai];
const team = (name) => one(teams, (t) => t.name === name).id;

// ---- 2. 選手を足す（101〜118 がテスト用の目印） ----
// 「チーム・部ごとに 2 人ずつ」になるように、足りないところだけ埋める。
const NEW_PLAYERS = [
  [101, 'まりえ', '愛知南', '2部'],
  [102, 'だいち', '愛知南', '3部'],
  [103, 'のんちゃん', '愛知南', '3部'],
  [104, 'タケ', '愛知中央', '1部'],
  [105, 'ゆみりん', '愛知中央', '1部'],
  [106, 'ケンジ', '愛知中央', '2部'],
  [107, 'あやの', '愛知中央', '3部'],
  [108, 'ショウ', '関東', '1部'],
  [109, 'ミホ', '関東', '2部'],
  [110, 'コージ', '関東', '2部'],
  [111, 'さっちゃん', '関東', '3部'],
  [112, 'リョウ', '関東', '3部'],
  [113, 'なおき', '関西', '1部'],
  [114, 'えみ', '関西', '1部'],
  [115, 'ハセ', '関西', '2部'],
  [116, 'ちなつ', '関西', '2部'],
  [117, 'トシ', '関西', '3部'],
  [118, 'みなみ', '関西', '3部'],
];
console.log('選手');
const newPlayers = await ins(
  'players',
  NEW_PLAYERS.map(([player_number, name]) => ({ player_number, name }))
);
console.log('参加');
const newParts = await ins(
  'participants',
  NEW_PLAYERS.map(([player_number, , teamName, divName]) => ({
    competition_id: comp.id,
    player_id: one(newPlayers, (p) => p.player_number === player_number).id,
    team_id: team(teamName),
    division_id: div(divName),
  }))
);

// チーム × 部 → その 2 人（participant の id）
const parts = [...parts0, ...newParts];
const pairOf = (teamName, divName) => {
  const found = parts.filter((p) => p.team_id === team(teamName) && p.division_id === div(divName));
  if (found.length !== 2) throw new Error(`${teamName} ${divName} が ${found.length} 人`);
  return found.map((p) => p.id);
};

// ---- 3. 段 ----
console.log('段');
const stages = await ins('stages', [
  { competition_id: comp.id, name: '予選リーグ', format: 'league', sort_order: 10 },
  { competition_id: comp.id, name: '決勝トーナメント', format: 'knockout', sort_order: 20 },
]);
const league = one(stages, (s) => s.name === '予選リーグ');
const knockout = one(stages, (s) => s.name === '決勝トーナメント');

// ---- 4. 段 × 部の決めごと（予選は 1 ゲーム、決勝は 3 ゲーム） ----
console.log('決めごと');
await ins(
  'match_settings',
  divisions.flatMap((d) => [
    { stage_id: league.id, division_id: d.id, max_game_count: 1 },
    { stage_id: knockout.id, division_id: d.id, max_game_count: 3 },
  ])
);

// ---- 5. 予選リーグの対戦（4 チーム総当たり = 6） ----
// 結果は 愛知南 3 勝 / 関東 2 勝 / 愛知中央 1 勝 / 関西 0 勝 になるように作る。
const LEAGUE = [
  { a: '愛知南', b: '愛知中央', scores: { '1部': [21, 17], '2部': [19, 21], '3部': [21, 14] } },
  { a: '愛知南', b: '関東', scores: { '1部': [21, 19], '2部': [21, 16], '3部': [18, 21] } },
  { a: '愛知南', b: '関西', scores: { '1部': [21, 12], '2部': [21, 15], '3部': [21, 9] } },
  { a: '関東', b: '愛知中央', scores: { '1部': [21, 15], '2部': [17, 21], '3部': [21, 18] } },
  { a: '関東', b: '関西', scores: { '1部': [21, 11], '2部': [21, 13], '3部': [21, 16] } },
  { a: '愛知中央', b: '関西', scores: { '1部': [21, 19], '2部': [14, 21], '3部': [21, 17] } },
];
console.log('対戦（予選）');
const leagueMatchups = await ins(
  'matchups',
  LEAGUE.map((m, i) => ({
    stage_id: league.id,
    round_name: `予選 第${i + 1}試合`,
    side_a_team_id: team(m.a),
    side_b_team_id: team(m.b),
    sort_order: (i + 1) * 10,
  }))
);

// ---- 6. 決勝トーナメントの対戦（準決勝は相手が決まっている、決勝と 3 位決定戦は空枠） ----
console.log('対戦（決勝）');
const koMatchups = await ins('matchups', [
  {
    stage_id: knockout.id,
    round_name: '準決勝1',
    side_a_team_id: team('愛知南'),
    side_b_team_id: team('関西'),
    sort_order: 10,
  },
  {
    stage_id: knockout.id,
    round_name: '準決勝2',
    side_a_team_id: team('関東'),
    side_b_team_id: team('愛知中央'),
    sort_order: 20,
  },
  {
    stage_id: knockout.id,
    round_name: '3位決定戦',
    side_a_slot_label: '準決勝1 敗者',
    side_b_slot_label: '準決勝2 敗者',
    sort_order: 30,
  },
  {
    stage_id: knockout.id,
    round_name: '決勝',
    side_a_slot_label: '準決勝1 勝者',
    side_b_slot_label: '準決勝2 勝者',
    sort_order: 40,
  },
]);
const semi1 = one(koMatchups, (m) => m.round_name === '準決勝1');
const semi2 = one(koMatchups, (m) => m.round_name === '準決勝2');

// ---- 7. 試合・出場者・得点 ----
// コートは 1部→1コート、2部→2コート、3部→3コート。
const DIV_ORDER = ['1部', '2部', '3部'];
const at = (h, m) =>
  `2027-01-22T${String(h - 9).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`; // 日本時間

const matchRows = [];
// 挿入した順に返ってくる保証は無いので、対戦 id + 並び順を鍵にして引き当てる。
const plan = new Map();
const key = (row) => `${row.matchup_id}:${row.order_in_matchup}`;
const push = (row, detail) => {
  matchRows.push(row);
  plan.set(key(row), detail);
};

LEAGUE.forEach((m, i) => {
  DIV_ORDER.forEach((divName, j) => {
    const start = 10 + i; // 10:00 から 1 対戦ずつ
    push(
      {
        matchup_id: one(leagueMatchups, (x) => x.round_name === `予選 第${i + 1}試合`).id,
        division_id: div(divName),
        order_in_matchup: j + 1,
        court_number: j + 1,
        order_in_court: i + 1,
        status: 'done',
        ending: 'normal',
        max_game_count: 1,
        started_at: at(start, 0),
        finished_at: at(start, 35),
      },
      { a: pairOf(m.a, divName), b: pairOf(m.b, divName), games: [m.scores[divName]] }
    );
  });
});

// 準決勝1: 1部は終了、2部は進行中、3部はこれから
const SEMI1 = [
  {
    div: '1部',
    status: 'done',
    games: [
      [21, 18],
      [19, 21],
      [21, 15],
    ],
  },
  { div: '2部', status: 'live', games: [[15, 12]] },
  { div: '3部', status: 'waiting', games: [] },
];
SEMI1.forEach((s, j) => {
  push(
    {
      matchup_id: semi1.id,
      division_id: div(s.div),
      order_in_matchup: j + 1,
      court_number: j + 1,
      order_in_court: 7,
      status: s.status,
      ending: 'normal',
      max_game_count: 3,
      started_at: s.status === 'waiting' ? null : at(16, 0),
      finished_at: s.status === 'done' ? at(16, 55) : null,
    },
    { a: pairOf('愛知南', s.div), b: pairOf('関西', s.div), games: s.games }
  );
});

// 準決勝2: まだこれから
DIV_ORDER.forEach((divName, j) => {
  push(
    {
      matchup_id: semi2.id,
      division_id: div(divName),
      order_in_matchup: j + 1,
      court_number: j + 1,
      order_in_court: 8,
      status: 'waiting',
      ending: 'normal',
      max_game_count: 3,
    },
    { a: pairOf('関東', divName), b: pairOf('愛知中央', divName), games: [] }
  );
});

console.log('試合');
const matches = await ins('matches', matchRows);

console.log('出場者');
await ins(
  'match_players',
  matches.flatMap((match) => {
    const { a, b } = plan.get(key(match));
    return [
      { match_id: match.id, side: 'a', participant_id: a[0], order_in_pair: 1 },
      { match_id: match.id, side: 'a', participant_id: a[1], order_in_pair: 2 },
      { match_id: match.id, side: 'b', participant_id: b[0], order_in_pair: 1 },
      { match_id: match.id, side: 'b', participant_id: b[1], order_in_pair: 2 },
    ];
  })
);

console.log('得点');
await ins(
  'game_scores',
  matches.flatMap((match) =>
    plan.get(key(match)).games.map(([side_a_score, side_b_score], g) => ({
      match_id: match.id,
      game_number: g + 1,
      side_a_score,
      side_b_score,
    }))
  )
);

console.log('\n完了');
