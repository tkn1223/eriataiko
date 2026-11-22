import { describe, expect, test } from 'vitest';
import { findEntryOptions } from '@/db/entry-options';

/**
 * 名前選び（入場画面・myページの観戦者向け）に出すデータ。
 * サンプルデータ（supabase/seed.sql）の「いまの大会」を読むだけで、何も書き換えない。
 * 実行前に `npm run db:start` が必要。
 */
describe('findEntryOptions', () => {
  test('いまの大会の名前・参加者・チーム・部が読める', async () => {
    const options = await findEntryOptions();

    expect(options.competitionName).toBeTruthy();
    expect(options.entrants.length).toBeGreaterThan(0);
    expect(options.teams.length).toBeGreaterThan(0);
    expect(options.divisions.length).toBeGreaterThan(0);

    const satou = options.entrants.find((entrant) => entrant.name === 'さとう');
    expect(satou).toBeDefined();
    expect(satou!.teamId).toBe(options.teams.find((team) => team.name === '愛知南')!.id);
  });

  test('参加者は番号順に並ぶ', async () => {
    const { entrants } = await findEntryOptions();
    const numbers = entrants.map((entrant) => entrant.playerNumber);

    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  test('合言葉が要るかどうかが入っている', async () => {
    const { passcodeRequired } = await findEntryOptions();

    expect(typeof passcodeRequired).toBe('boolean');
  });
});
