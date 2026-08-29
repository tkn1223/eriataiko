import { describe, expect, test, vi } from 'vitest';
import { saveScore, type SaveScoreRepository } from '@/usecases/save-score';
import { ApiError } from '@/server/route-helpers';

/** テストのたびに書き換える必要が無い、素直な「1 ゲーム目・3 ゲームまで・waiting」の試合。 */
function fakeRepository(overrides: Partial<SaveScoreRepository> = {}): SaveScoreRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'waiting', maxGameCount: 3 }),
    saveGameScore: vi.fn().mockResolvedValue(undefined),
    markLive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const NOW = new Date('2026-08-30T01:00:00Z');

describe('得点を送ると game_scores が保存される', () => {
  test('見つかった試合に対して saveGameScore が呼ばれる', async () => {
    const deps = fakeRepository();
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      now: NOW,
    });

    expect(deps.saveGameScore).toHaveBeenCalledWith({
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      now: NOW,
    });
  });
});

describe('waiting の試合に 1 点入ると live になる', () => {
  test('1 点でも入っていれば markLive が呼ばれる', async () => {
    const deps = fakeRepository();
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 1,
      sideBScore: 0,
      now: NOW,
    });

    expect(deps.markLive).toHaveBeenCalledWith({ matchId: 'match-1', startedAt: NOW });
  });

  test('0 対 0 を送っただけでは markLive が呼ばれない', async () => {
    const deps = fakeRepository();
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 0,
      sideBScore: 0,
      now: NOW,
    });

    expect(deps.markLive).not.toHaveBeenCalled();
  });

  test('すでに live な試合には markLive を呼ばない（無駄な書き込みをしない）', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3 }),
    });
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      now: NOW,
    });

    expect(deps.markLive).not.toHaveBeenCalled();
  });
});

describe('gameNumber の範囲チェック', () => {
  test('max_game_count が 1 の試合に 2 ゲーム目を送ると 400', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'waiting', maxGameCount: 1 }),
    });

    await expect(
      saveScore(deps, { matchId: 'match-1', gameNumber: 2, sideAScore: 1, sideBScore: 0, now: NOW })
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });

  test('gameNumber が 0 のとき 400', async () => {
    const deps = fakeRepository();
    await expect(
      saveScore(deps, { matchId: 'match-1', gameNumber: 0, sideAScore: 1, sideBScore: 0, now: NOW })
    ).rejects.toMatchObject({ status: 400 });
  });

  test('gameNumber が負の数のとき 400', async () => {
    const deps = fakeRepository();
    await expect(
      saveScore(deps, {
        matchId: 'match-1',
        gameNumber: -1,
        sideAScore: 1,
        sideBScore: 0,
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });
    await expect(
      saveScore(deps, { matchId: 'nope', gameNumber: 1, sideAScore: 1, sideBScore: 0, now: NOW })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('done の試合に得点を送ったとき', () => {
  test('409 が返り、保存されない', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done', maxGameCount: 3 }),
    });

    await expect(
      saveScore(deps, { matchId: 'match-1', gameNumber: 1, sideAScore: 1, sideBScore: 0, now: NOW })
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });
});

describe('ApiError を投げる', () => {
  test('404 は ApiError のインスタンス', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });
    await expect(
      saveScore(deps, { matchId: 'nope', gameNumber: 1, sideAScore: 1, sideBScore: 0, now: NOW })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
