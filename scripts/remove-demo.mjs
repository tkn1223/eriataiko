// scripts/seed-demo.mjs で入れたテストデータを消す。**本番のデータベースから消す。**
//
// 使い方:
//   node --env-file=.env.local scripts/remove-demo.mjs
//
// 消すのはこの 3 つだけ。実データ（大会・部・チーム 3 つ・選手 1〜6）には触らない。
//   1. 段（予選リーグ / 決勝トーナメント）… 下の対戦・試合・出場者・得点・決めごとも一緒に消える
//   2. 選手番号 101〜118 …………………… 参加と出場者も一緒に消える
//   3. チーム「関西」
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が要ります。');
  console.error('例: node --env-file=.env.local scripts/remove-demo.mjs');
  process.exit(1);
}
console.log(`つなぐ先: ${url}`);
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: comp } = await db.from('competitions').select('*').eq('is_current', true).single();
console.log(`大会: ${comp.name}`);

const del = async (label, query) => {
  const { data, error } = await query.select();
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`  ${label}: ${data.length} 件`);
};

await del(
  '段（予選・決勝と、その下の対戦・試合・得点）',
  db.from('stages').delete().eq('competition_id', comp.id)
);
await del(
  'テスト用の選手 101〜118（参加・出場者も一緒に）',
  db.from('players').delete().gte('player_number', 101).lte('player_number', 118)
);
await del(
  'チーム「関西」',
  db.from('teams').delete().eq('competition_id', comp.id).eq('name', '関西')
);

for (const t of [
  'stages',
  'matchups',
  'matches',
  'match_players',
  'game_scores',
  'match_settings',
  'players',
  'participants',
  'teams',
]) {
  const { count } = await db.from(t).select('*', { count: 'exact', head: true });
  console.log(`残り ${t}: ${count}`);
}
