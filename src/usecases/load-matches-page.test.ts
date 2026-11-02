import { describe, expect, test, vi } from 'vitest';
import type { MatchesViewInput } from '@/usecases/build-matches-view';
import { loadMatchesPage, type LoadMatchesPageDeps } from '@/usecases/load-matches-page';

/**
 * `/matches` の page.tsx が「どの画面を出すか」を決める部分を、DB を使わずに確かめる
 * （`load-courts-page.test.ts` と同じ形。page.tsx は async な Server Component で
 * Vitest では動かせないため、分岐だけを切り出している）。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

const EMPTY_DATA: MatchesViewInput = {
  myParticipantId: null,
  divisions: [],
  matches: [],
  truncated: false,
};

function fakeDeps(overrides: Partial<LoadMatchesPageDeps> = {}): LoadMatchesPageDeps {
  return {
    findCurrentCompetitionId: vi.fn().mockResolvedValue('competition-1'),
    findMatchesBoardData: vi.fn().mockResolvedValue(EMPTY_DATA),
    ...overrides,
  };
}

const PLAYER = { role: 'player', playerId: 'player-1' } as const;
const VIEWER = { role: 'viewer' } as const;

describe('大会が無い／つながらないとき、日本語の案内を出す分岐になる', () => {
  test('いまの大会が無ければ not-found になり、試合は読みに行かない', async () => {
    const deps = fakeDeps({ findCurrentCompetitionId: vi.fn().mockResolvedValue(null) });

    const result = await loadMatchesPage(deps, VIEWER);

    expect(result).toEqual({ kind: 'not-found' });
    expect(deps.findMatchesBoardData).not.toHaveBeenCalled();
  });

  test('大会を読むところでつながらなければ connection-error になり、理由が入る', async () => {
    const deps = fakeDeps({
      findCurrentCompetitionId: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });

    expect(await loadMatchesPage(deps, VIEWER)).toEqual({
      kind: 'connection-error',
      message: 'fetch failed',
    });
  });

  test('試合を読むところでつながらなくても connection-error になる', async () => {
    const deps = fakeDeps({
      findMatchesBoardData: vi.fn().mockRejectedValue(new Error('permission denied')),
    });

    expect(await loadMatchesPage(deps, PLAYER)).toEqual({
      kind: 'connection-error',
      message: 'permission denied',
    });
  });

  test('Error 以外が投げられても、黙らずに文字にして返す', async () => {
    const deps = fakeDeps({ findMatchesBoardData: vi.fn().mockRejectedValue('timeout') });

    expect(await loadMatchesPage(deps, PLAYER)).toEqual({
      kind: 'connection-error',
      message: 'timeout',
    });
  });
});

describe('読めたときは画面の形と、絞り込みを出すかどうかを返す', () => {
  test('選手として入った人は canFilterMine が true で、自分の playerId で読む', async () => {
    const deps = fakeDeps();

    const result = await loadMatchesPage(deps, PLAYER);

    expect(result).toMatchObject({ kind: 'ready', canFilterMine: true });
    expect(deps.findMatchesBoardData).toHaveBeenCalledWith('competition-1', 'player-1');
  });

  test('観戦者は canFilterMine が false で、playerId を渡さずに読む', async () => {
    const deps = fakeDeps();

    const result = await loadMatchesPage(deps, VIEWER);

    expect(result).toMatchObject({ kind: 'ready', canFilterMine: false });
    expect(deps.findMatchesBoardData).toHaveBeenCalledWith('competition-1', null);
  });

  test('未入場（session が null）も canFilterMine が false', async () => {
    const result = await loadMatchesPage(fakeDeps(), null);

    expect(result).toMatchObject({ kind: 'ready', canFilterMine: false });
  });

  test('試合が 1 つも無い大会は、ready で board が空（画面が「まだ試合が登録されていません」を出す）', async () => {
    const result = await loadMatchesPage(fakeDeps(), VIEWER);

    expect(result.kind === 'ready' && result.view.board).toEqual([]);
  });

  test('読む上限を超えた印が画面に渡る', async () => {
    const deps = fakeDeps({
      findMatchesBoardData: vi.fn().mockResolvedValue({ ...EMPTY_DATA, truncated: true }),
    });

    const result = await loadMatchesPage(deps, VIEWER);

    expect(result.kind === 'ready' && result.view.truncated).toBe(true);
  });
});
