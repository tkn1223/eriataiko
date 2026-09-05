import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { loadTestEnv } from '../../tests/load-env.mjs';
import type { Database } from '@/types/database';

/**
 * 観戦者として入場しておく。
 *
 * 大会の画面（`/courts` など）は、入場していないと入場画面へ送られる
 * （`src/app/(app)/layout.tsx`）。それぞれの画面テストで確かめたいのは
 * 中身の作りなので、入場そのものはここで済ませる。
 *
 * **画面を操作せず API を直に叩いている。** 入場画面の作りが変わっても
 * すべての画面テストが道連れで壊れないようにするため。
 * 入場画面そのものの確認は `e2e/enter.spec.ts` が受け持つ。
 */
export async function enterAsViewer(page: Page) {
  const response = await page.request.post('/api/session', { data: { as: 'viewer' } });
  if (!response.ok()) {
    throw new Error(`観戦者として入場できませんでした（${response.status()}）`);
  }
}

// 鍵も合言葉も `.env.test` から読む（`e2e/helpers/long-name-player.ts` と同じ）。
// ここに書き写すと、値を入れ直したときに片方だけ古いまま残る。
const env = loadTestEnv();

/**
 * `supabase/seed.sql` のチーム名・名前から playerId を引く。
 *
 * 入場 API（`/api/session`）は playerId（uuid）を求めるが、seed.sql は
 * 選手の id を固定値にしていない（player_number だけが固定）。UI（/enter）を
 * 操作せずに実在の人として入場するには、DB を直接引くしかない。
 */
async function findPlayerId(teamName: string, playerName: string): Promise<string> {
  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await supabase
    .from('participants')
    .select('players!inner(id, name), teams!inner(name)')
    .eq('players.name', playerName)
    .eq('teams.name', teamName)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `${teamName} の ${playerName} が見つかりませんでした（supabase/seed.sql を確認）`
    );
  }
  return data.players.id;
}

/**
 * 実在の参加者として入場しておく（`supabase/seed.sql` の名前）。
 * 観戦者と違い合言葉が要るので、テスト専用の合言葉を使う（`.env.test` と同じ値）。
 */
export async function enterAsPlayer(page: Page, teamName: string, playerName: string) {
  const playerId = await findPlayerId(teamName, playerName);
  const response = await page.request.post('/api/session', {
    data: { as: 'player', playerId, passcode: env.TOURNAMENT_PASSCODE },
  });
  if (!response.ok()) {
    throw new Error(`${playerName} として入場できませんでした（${response.status()}）`);
  }
}
