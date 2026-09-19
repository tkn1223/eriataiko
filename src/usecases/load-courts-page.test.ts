import { describe, expect, test, vi } from 'vitest';
import { loadCourtsPage, type LoadCourtsPageDeps } from '@/usecases/load-courts-page';
import type { CourtsViewInput } from '@/usecases/build-courts-view';

/**
 * `/courts` の page.tsx が「どの画面を出すか」を決める部分を、DB を使わずに確かめる。
 *
 * page.tsx は async な Server Component なので Vitest では動かせず、
 * 「大会が無い」「つながらない」を e2e で起こすには手元の DB を壊すしかない。
 * そこで分岐だけを `loadCourtsPage` に切り出し、読み込みを偽物に差し替えて確かめる。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md（受け入れ基準「大会が無い／つながらないとき」）
 */

const EMPTY_DATA: CourtsViewInput = {
  myParticipantId: null,
  divisions: [],
  stages: [{ id: 'stage-league', name: '予選リーグ', sortOrder: 10 }],
  matches: [],
};

function fakeDeps(overrides: Partial<LoadCourtsPageDeps> = {}): LoadCourtsPageDeps {
  return {
    findCurrentCompetitionId: vi.fn().mockResolvedValue('competition-1'),
    findCourtsData: vi.fn().mockResolvedValue(EMPTY_DATA),
    ...overrides,
  };
}

const PLAYER = { role: 'player', playerId: 'player-1' } as const;
const VIEWER = { role: 'viewer' } as const;

describe('大会が無い／つながらないとき、日本語の案内を出す分岐になる', () => {
  test('いまの大会が無ければ not-found になり、試合は読みに行かない', async () => {
    const deps = fakeDeps({ findCurrentCompetitionId: vi.fn().mockResolvedValue(null) });

    const result = await loadCourtsPage(deps, VIEWER);

    expect(result).toEqual({ kind: 'not-found' });
    expect(deps.findCourtsData).not.toHaveBeenCalled();
  });

  test('大会を読むところでつながらなければ connection-error になり、理由が入る', async () => {
    const deps = fakeDeps({
      findCurrentCompetitionId: vi.fn().mockRejectedValue(new Error('fetch failed')),
    });

    const result = await loadCourtsPage(deps, VIEWER);

    expect(result).toEqual({ kind: 'connection-error', message: 'fetch failed' });
  });

  test('試合を読むところでつながらなくても connection-error になる', async () => {
    const deps = fakeDeps({
      findCourtsData: vi.fn().mockRejectedValue(new Error('permission denied')),
    });

    const result = await loadCourtsPage(deps, PLAYER);

    expect(result).toEqual({ kind: 'connection-error', message: 'permission denied' });
  });

  test('Error 以外が投げられても、黙らずに文字にして返す', async () => {
    const deps = fakeDeps({ findCourtsData: vi.fn().mockRejectedValue('timeout') });

    const result = await loadCourtsPage(deps, PLAYER);

    expect(result).toEqual({ kind: 'connection-error', message: 'timeout' });
  });
});

describe('読めたときは画面の形と、押せるかどうかを返す', () => {
  test('選手として入った人は canInput が true で、自分の playerId で読む', async () => {
    const deps = fakeDeps();

    const result = await loadCourtsPage(deps, PLAYER);

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.canInput).toBe(true);
    expect(result.view.courts).toHaveLength(8);
    expect(result.view.stageLabel).toBe('予選リーグ');
    expect(deps.findCourtsData).toHaveBeenCalledWith('competition-1', 'player-1');
  });

  test('観戦者は canInput が false で、playerId は null で読む（あなたの試合が付かない）', async () => {
    const deps = fakeDeps();

    const result = await loadCourtsPage(deps, VIEWER);

    expect(result).toMatchObject({ kind: 'ready', canInput: false });
    expect(deps.findCourtsData).toHaveBeenCalledWith('competition-1', null);
  });

  test('未入場（session が null）も観戦者と同じ扱い', async () => {
    const deps = fakeDeps();

    const result = await loadCourtsPage(deps, null);

    expect(result).toMatchObject({ kind: 'ready', canInput: false });
    expect(deps.findCourtsData).toHaveBeenCalledWith('competition-1', null);
  });
});
