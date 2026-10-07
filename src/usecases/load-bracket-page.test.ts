import { describe, expect, test, vi } from 'vitest';
import type { BracketViewInput } from '@/usecases/build-bracket-view';
import { loadBracketPage, type LoadBracketPageDeps } from '@/usecases/load-bracket-page';

/**
 * `/bracket` の page.tsx が「どの画面を出すか」を DB を使わずに確かめる。
 *
 * page.tsx は async な Server Component なので Vitest では動かせず、
 * 「大会が無い」「つながらない」を e2e で起こすには手元の DB を壊すしかない。
 * そこで分岐だけを `loadBracketPage` に切り出し、読み込みを偽物に差し替えて確かめる
 * （`load-courts-page.test.ts` と同じやり方）。
 *
 * 仕様: docs/specs/2026-10-07-bracket-real-data.md（受け入れ基準「大会が無い／つながらない／予選の組み合わせが無い」）
 */

const TEAMS = [
  { id: 'team-1', teamNumber: 1, name: '愛知南', sortOrder: 10 },
  { id: 'team-2', teamNumber: 2, name: '愛知中央', sortOrder: 20 },
];

const WITH_LEAGUE: BracketViewInput = {
  myTeamId: 'team-2',
  divisions: [],
  teams: TEAMS,
  matchups: [
    {
      id: 'matchup-1',
      stageFormat: 'league',
      stageSortOrder: 10,
      roundName: '予選 1回戦',
      sortOrder: 10,
      sideATeamId: 'team-1',
      sideBTeamId: 'team-2',
      sideASlotLabel: null,
      sideBSlotLabel: null,
      matches: [],
    },
  ],
  truncated: false,
};

const NO_LEAGUE: BracketViewInput = { ...WITH_LEAGUE, matchups: [] };

function fakeDeps(overrides: Partial<LoadBracketPageDeps> = {}): LoadBracketPageDeps {
  return {
    findCurrentCompetition: vi.fn().mockResolvedValue({ id: 'competition-1' }),
    findBracketData: vi.fn().mockResolvedValue(WITH_LEAGUE),
    ...overrides,
  };
}

const PLAYER = { role: 'player', playerId: 'player-1' } as const;
const VIEWER = { role: 'viewer' } as const;

describe('大会が無い／つながらない／予選の組み合わせが無いとき、日本語の案内を出す分岐になる', () => {
  test('いまの大会が無ければ not-found になり、対戦は読みに行かない', async () => {
    const deps = fakeDeps({ findCurrentCompetition: vi.fn().mockResolvedValue(null) });

    const result = await loadBracketPage(deps, VIEWER);

    expect(result).toEqual({ kind: 'not-found' });
    expect(deps.findBracketData).not.toHaveBeenCalled();
  });

  test('大会を読むところでつながらなければ connection-error になり、理由が入る', async () => {
    const deps = fakeDeps({
      findCurrentCompetition: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });

    const result = await loadBracketPage(deps, VIEWER);

    expect(result).toEqual({ kind: 'connection-error', message: 'fetch failed' });
  });

  test('対戦を読むところでつながらなくても connection-error になる', async () => {
    const deps = fakeDeps({
      findBracketData: vi.fn().mockRejectedValue(new Error('permission denied')),
    });

    const result = await loadBracketPage(deps, PLAYER);

    expect(result).toEqual({ kind: 'connection-error', message: 'permission denied' });
  });

  test('Error 以外が投げられても、黙らずに文字にして返す', async () => {
    const deps = fakeDeps({ findBracketData: vi.fn().mockRejectedValue('timeout') });

    const result = await loadBracketPage(deps, PLAYER);

    expect(result).toEqual({ kind: 'connection-error', message: 'timeout' });
  });

  test('予選リーグの対戦がまだ 1 つも無ければ no-league になる', async () => {
    const deps = fakeDeps({ findBracketData: vi.fn().mockResolvedValue(NO_LEAGUE) });

    const result = await loadBracketPage(deps, PLAYER);

    expect(result).toEqual({ kind: 'no-league' });
  });
});

describe('読めたときは画面の形を返す', () => {
  test('予選の対戦があれば ready になり、組み立てた画面の形が入る', async () => {
    const deps = fakeDeps();

    const result = await loadBracketPage(deps, PLAYER);

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.view.teams.map((team) => team.name)).toEqual(['愛知南', '愛知中央']);
    expect(result.view.leagueCards).toHaveLength(1);
  });

  test('選手として入った人は、自分の playerId で読む', async () => {
    const deps = fakeDeps();

    await loadBracketPage(deps, PLAYER);

    expect(deps.findBracketData).toHaveBeenCalledWith('competition-1', 'player-1');
  });

  test('観戦者は playerId は null で読む（自分のチームの印が付かない）', async () => {
    const deps = fakeDeps();

    const result = await loadBracketPage(deps, VIEWER);

    expect(result.kind).toBe('ready');
    expect(deps.findBracketData).toHaveBeenCalledWith('competition-1', null);
  });

  test('未入場（session が null）も観戦者と同じ扱い', async () => {
    const deps = fakeDeps();

    await loadBracketPage(deps, null);

    expect(deps.findBracketData).toHaveBeenCalledWith('competition-1', null);
  });
});
