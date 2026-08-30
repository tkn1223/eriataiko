import { describe, expect, test, vi } from 'vitest';
import { reopenMatch, type ReopenMatchRepository } from '@/usecases/reopen-match';
import { ApiError } from '@/server/route-helpers';

function fakeRepository(overrides: Partial<ReopenMatchRepository> = {}): ReopenMatchRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    reopen: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('終了の取り消しを送ると status が live に戻る', () => {
  test('done の試合には reopen が呼ばれる', async () => {
    const deps = fakeRepository();
    await reopenMatch(deps, { matchId: 'match-1' });

    expect(deps.reopen).toHaveBeenCalledWith({ matchId: 'match-1' });
  });
});

describe('done でない試合に送ったとき', () => {
  test('waiting の試合には何もせず成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'waiting' }),
    });

    await reopenMatch(deps, { matchId: 'match-1' });

    expect(deps.reopen).not.toHaveBeenCalled();
  });

  test('live の試合には何もせず成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live' }),
    });

    await reopenMatch(deps, { matchId: 'match-1' });

    expect(deps.reopen).not.toHaveBeenCalled();
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });

    await expect(reopenMatch(deps, { matchId: 'nope' })).rejects.toMatchObject({ status: 404 });
    await expect(reopenMatch(deps, { matchId: 'nope' })).rejects.toBeInstanceOf(ApiError);
  });
});
