import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildCompetitionPlan } from '../scripts/lib/competition-csv.mjs';
import {
  ImportBlockedError,
  importCompetition,
  setCurrentCompetition,
} from '../scripts/lib/import-competition-db.mjs';

/**
 * CSV 取り込みを手元の DB（.env.test）に対して動かす。
 * 仕様: docs/specs/2026-10-11-csv-import.md
 *
 * 同じ DB を他のテスト・e2e も使うので、
 *   - 大会の名前・日付・会場はこのテスト専用にして seed と重ならないようにする
 *   - 終わったら自分で作ったものを全部消し、seed の「いまの大会」の印を元に戻す
 *   - 印を付け替えるので、ほかのテストと同時には流さない（vitest.config.mts の
 *     current-competition。ほかが全部終わってから流れる）
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const COMPETITION_NAME = 'CSV取込テスト大会';
const DATE_A = '2098-06-15';
const DATE_B = '2098-07-20';
const HALL_NAME = 'CSV取込テスト体育館';
const SAMPLE_PLAYER_NUMBERS = Array.from({ length: 25 }, (_, i) => 5001 + i);

const read = (name: string) => readFileSync(`docs/import-sample/${name}.csv`, 'utf8');

/** 見本の大会.csv の 大会・会場の行を、このテスト専用の値に差し替えて計画を作る */
function samplePlan(heldOn: string, name = COMPETITION_NAME) {
  const competitionCsv = read('大会')
    .replace(/^大会,.*$/m, `大会,${name},${heldOn}`)
    .replace(/^会場,.*$/m, `会場,${HALL_NAME},9`);
  const { problems, plan } = buildCompetitionPlan({
    competitionCsv,
    playersCsv: read('選手'),
    matchesCsv: read('試合'),
  });
  expect(problems).toEqual([]);
  return plan!;
}

async function findCompetition(heldOn: string) {
  const { data, error } = await admin
    .from('competitions')
    .select('id, is_current, hall_id, court_count')
    .eq('name', COMPETITION_NAME)
    .eq('held_on', heldOn)
    .limit(5);
  expect(error).toBeNull();
  return data ?? [];
}

async function countRows(competitionId: string) {
  const count = async (
    table: 'divisions' | 'teams' | 'participants' | 'stages',
    column = 'competition_id'
  ) => {
    const { count: n } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, competitionId);
    return n ?? 0;
  };
  const { data: stageRows } = await admin
    .from('stages')
    .select('id')
    .eq('competition_id', competitionId)
    .limit(50);
  const stageIds = (stageRows ?? []).map((row) => row.id);
  const { data: matchupRows } = await admin
    .from('matchups')
    .select('id')
    .in('stage_id', stageIds)
    .limit(200);
  const matchupIds = (matchupRows ?? []).map((row) => row.id);
  const { data: matchRows } = await admin
    .from('matches')
    .select('id, max_game_count, matchup_id')
    .in('matchup_id', matchupIds)
    .limit(500);
  const { count: matchPlayers } = await admin
    .from('match_players')
    .select('id', { count: 'exact', head: true })
    .in(
      'match_id',
      (matchRows ?? []).map((row) => row.id)
    );
  const { count: settings } = await admin
    .from('match_settings')
    .select('id', { count: 'exact', head: true })
    .in('stage_id', stageIds);
  return {
    divisions: await count('divisions'),
    teams: await count('teams'),
    participants: await count('participants'),
    stages: await count('stages'),
    matchups: matchupIds.length,
    matches: matchRows?.length ?? 0,
    matchPlayers: matchPlayers ?? 0,
    matchSettings: settings ?? 0,
    matchRows: matchRows ?? [],
  };
}

let originalCurrentIds: string[] = [];

async function cleanup() {
  await admin.from('competitions').delete().in('held_on', [DATE_A, DATE_B]);
  await admin.from('players').delete().in('player_number', SAMPLE_PLAYER_NUMBERS);
  await admin.from('halls').delete().eq('name', HALL_NAME);
}

async function restoreCurrent() {
  // 先に全部外してから元に戻す（印は同時に 1 つしか付けられない）
  await admin.from('competitions').update({ is_current: false }).eq('is_current', true);
  if (originalCurrentIds.length > 0) {
    await admin.from('competitions').update({ is_current: true }).in('id', originalCurrentIds);
  }
}

beforeAll(async () => {
  const { data } = await admin.from('competitions').select('id').eq('is_current', true).limit(5);
  originalCurrentIds = (data ?? []).map((row) => row.id);
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await restoreCurrent();
});

describe('見本の 3 枚を取り込む', () => {
  test('空の大会に取り込むと、4 チーム・3 部・予選 6 対戦・決勝 4 対戦・出場者が入る', async () => {
    const plan = samplePlan(DATE_A);
    const result = await importCompetition(admin, plan);
    expect(result.replaced).toBe(false);

    const [competition] = await findCompetition(DATE_A);
    expect(competition.court_count).toBe(9);
    expect(competition.hall_id).not.toBeNull();
    // 取り込んだだけでは「いまの大会」にしない（切り替えは別のコマンド）
    expect(competition.is_current).toBe(false);

    const counts = await countRows(competition.id);
    expect(counts).toMatchObject({
      divisions: 3,
      teams: 4,
      participants: 25,
      stages: 2,
      matchups: 10,
      matches: 30,
      matchSettings: 6,
      // 予選 18 試合 × 4 人。決勝は出場者が空
      matchPlayers: 72,
    });
  });

  test('試合の max_game_count は大会.csv の「段/部」のゲーム数（予選 1・決勝 3）', async () => {
    const [competition] = await findCompetition(DATE_A);
    const { matchRows } = await countRows(competition.id);
    const gameCounts = matchRows.map((row) => row.max_game_count);
    expect(gameCounts.filter((n) => n === 1)).toHaveLength(18);
    expect(gameCounts.filter((n) => n === 3)).toHaveLength(12);
  });

  test('決勝の「予選1位」などは空枠のラベルとして入る', async () => {
    const [competition] = await findCompetition(DATE_A);
    const { data: stage } = await admin
      .from('stages')
      .select('id')
      .eq('competition_id', competition.id)
      .eq('format', 'knockout')
      .single();
    const { data: matchups } = await admin
      .from('matchups')
      .select('round_name, side_a_team_id, side_a_slot_label, sort_order')
      .eq('stage_id', stage!.id)
      .order('sort_order')
      .limit(10);
    expect(matchups!.map((m) => m.round_name)).toEqual(['準決勝1', '準決勝2', '決勝', '3位決定戦']);
    expect(matchups![0].side_a_team_id).toBeNull();
    expect(matchups![0].side_a_slot_label).toBe('予選1位');
  });

  test('同じ 3 枚をもう一度取り込むと、件数が増えずに入れ直される。「いまの大会」の印は残る', async () => {
    const [before] = await findCompetition(DATE_A);
    const countsBefore = await countRows(before.id);
    const { data: playersBefore } = await admin
      .from('players')
      .select('id')
      .in('player_number', SAMPLE_PLAYER_NUMBERS)
      .limit(100);

    await admin.from('competitions').update({ is_current: false }).eq('is_current', true);
    await admin.from('competitions').update({ is_current: true }).eq('id', before.id);
    try {
      const result = await importCompetition(admin, samplePlan(DATE_A));
      expect(result.replaced).toBe(true);

      const after = await findCompetition(DATE_A);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before.id);
      expect(after[0].is_current).toBe(true);
      expect(await countRows(before.id)).toMatchObject({
        divisions: countsBefore.divisions,
        teams: countsBefore.teams,
        participants: countsBefore.participants,
        stages: countsBefore.stages,
        matchups: countsBefore.matchups,
        matches: countsBefore.matches,
        matchPlayers: countsBefore.matchPlayers,
        matchSettings: countsBefore.matchSettings,
      });
      // 選手は作り直さない（id が同じ）
      const { data: playersAfter } = await admin
        .from('players')
        .select('id')
        .in('player_number', SAMPLE_PLAYER_NUMBERS)
        .limit(100);
      expect(new Set(playersAfter!.map((p) => p.id))).toEqual(
        new Set(playersBefore!.map((p) => p.id))
      );
    } finally {
      await restoreCurrent();
    }
  });

  test('同じ日付なら大会名を変えて入れ直しても大会は増えず、名前が直り、印も残る', async () => {
    const [before] = await findCompetition(DATE_A);
    await admin.from('competitions').update({ is_current: false }).eq('is_current', true);
    await admin.from('competitions').update({ is_current: true }).eq('id', before.id);
    try {
      const result = await importCompetition(
        admin,
        samplePlan(DATE_A, `${COMPETITION_NAME}（直し）`)
      );
      expect(result.replaced).toBe(true);
      expect(result.competitionId).toBe(before.id);

      const { data } = await admin
        .from('competitions')
        .select('id, name, is_current')
        .eq('held_on', DATE_A)
        .limit(5);
      expect(data).toEqual([
        { id: before.id, name: `${COMPETITION_NAME}（直し）`, is_current: true },
      ]);
    } finally {
      await importCompetition(admin, samplePlan(DATE_A));
      await restoreCurrent();
    }
  });

  test('同じ日付の大会が 2 つあれば止まる', async () => {
    const { data: extra } = await admin
      .from('competitions')
      .insert({ name: `${COMPETITION_NAME}（重複）`, held_on: DATE_A })
      .select('id')
      .single();
    try {
      await expect(importCompetition(admin, samplePlan(DATE_A))).rejects.toThrow(/2 件/);
    } finally {
      await admin.from('competitions').delete().eq('id', extra!.id);
    }
  });

  test('選手番号が既にある人は作り直さず、名前が違えば直す', async () => {
    const { data: before } = await admin
      .from('players')
      .select('id')
      .eq('player_number', 5001)
      .single();
    await admin.from('players').update({ name: '古い名前' }).eq('player_number', 5001);

    await importCompetition(admin, samplePlan(DATE_A));

    const { data: after } = await admin
      .from('players')
      .select('id, name')
      .eq('player_number', 5001)
      .single();
    expect(after!.id).toBe(before!.id);
    expect(after!.name).toBe('ハルキ');
  });
});

describe('点が入っている大会は書き換えずに止まる', () => {
  test('点が 1 つでもあると、何も変えずに理由を日本語で出して止まる', async () => {
    const [competition] = await findCompetition(DATE_A);
    const before = await countRows(competition.id);
    const firstMatchId = before.matchRows[0].id;
    await admin
      .from('game_scores')
      .insert({ match_id: firstMatchId, game_number: 1, side_a_score: 1, side_b_score: 0 });
    try {
      const attempt = importCompetition(admin, samplePlan(DATE_A));
      await expect(attempt).rejects.toBeInstanceOf(ImportBlockedError);
      await expect(attempt).rejects.toThrow(/点/);

      const after = await countRows(competition.id);
      // 試合の id が同じ = 消されていない
      expect(after.matchRows.map((row) => row.id).sort()).toEqual(
        before.matchRows.map((row) => row.id).sort()
      );
    } finally {
      await admin.from('game_scores').delete().eq('match_id', firstMatchId);
    }
  });

  test('点が無くても、始まった試合（waiting 以外）があると止まる', async () => {
    const [competition] = await findCompetition(DATE_A);
    const { matchRows } = await countRows(competition.id);
    const matchId = matchRows[0].id;
    await admin.from('matches').update({ status: 'live' }).eq('id', matchId);
    try {
      await expect(importCompetition(admin, samplePlan(DATE_A))).rejects.toThrow(/始まった試合/);
      expect((await countRows(competition.id)).matchRows.map((row) => row.id)).toContain(matchId);
    } finally {
      await admin.from('matches').update({ status: 'waiting' }).eq('id', matchId);
    }
  });
});

describe('いまの大会の印を移す（set-current）', () => {
  test('日付の大会に印が移り、印は常に 1 つだけ', async () => {
    await importCompetition(admin, samplePlan(DATE_B));
    try {
      await setCurrentCompetition(admin, DATE_A);
      const afterA = await admin
        .from('competitions')
        .select('held_on, name')
        .eq('is_current', true);
      expect(afterA.data).toEqual([{ held_on: DATE_A, name: COMPETITION_NAME }]);

      await setCurrentCompetition(admin, DATE_B);
      const afterB = await admin
        .from('competitions')
        .select('held_on, name')
        .eq('is_current', true);
      expect(afterB.data).toEqual([{ held_on: DATE_B, name: COMPETITION_NAME }]);
    } finally {
      await restoreCurrent();
    }
  });

  test('その日付の大会が無ければ止まる', async () => {
    await expect(setCurrentCompetition(admin, '2098-12-31')).rejects.toThrow(/ありません/);
  });
});
