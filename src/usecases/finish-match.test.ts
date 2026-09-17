import { describe, expect, test, vi } from 'vitest';
import { finishMatch, type FinishMatchRepository } from '@/usecases/finish-match';
import { canFinishMatch } from '@/domain/match-rules';
import { ApiError } from '@/server/route-helpers';

function fakeRepository(overrides: Partial<FinishMatchRepository> = {}): FinishMatchRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3 }),
    findGameScores: vi.fn().mockResolvedValue([{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }]),
    finish: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const NOW = new Date('2026-08-30T02:00:00Z');

describe('終了を送ると status が done になる', () => {
  test('finish が finishedAt 付きで呼ばれる', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', now: NOW });

    expect(deps.finish).toHaveBeenCalledWith({ matchId: 'match-1', finishedAt: NOW });
  });
});

describe('1 点も入っていない試合に終了を送ったとき', () => {
  test('400 が返り、finish は呼ばれない', async () => {
    const deps = fakeRepository({
      findGameScores: vi.fn().mockResolvedValue([{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }]),
    });

    await expect(finishMatch(deps, { matchId: 'match-1', now: NOW })).rejects.toMatchObject({
      status: 400,
    });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('ゲームが 1 件も無い試合でも 400', async () => {
    const deps = fakeRepository({ findGameScores: vi.fn().mockResolvedValue([]) });

    await expect(finishMatch(deps, { matchId: 'match-1', now: NOW })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('既に done の試合に終了を送ったとき', () => {
  test('二重に押しても何も変えずに成功する（finish を呼ばない）', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    });

    await finishMatch(deps, { matchId: 'match-1', now: NOW });

    expect(deps.finish).not.toHaveBeenCalled();
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });

    await expect(finishMatch(deps, { matchId: 'nope', now: NOW })).rejects.toMatchObject({
      status: 404,
    });
    await expect(finishMatch(deps, { matchId: 'nope', now: NOW })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('同点（勝ちゲーム数が同数）の試合に終了を送ったとき（PR #52 レビュー指摘4）', () => {
  test('400 が返り、finish は呼ばれない', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3 }),
      findGameScores: vi.fn().mockResolvedValue([
        { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
        { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
      ]),
    });

    await expect(finishMatch(deps, { matchId: 'match-1', now: NOW })).rejects.toMatchObject({
      status: 400,
    });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('理由の文言は domain の canFinishMatch と同じ（ルールが1か所にまとまっている証拠）', async () => {
    const scores = [
      { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
      { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
    ];
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3 }),
      findGameScores: vi.fn().mockResolvedValue(scores),
    });

    const expected = canFinishMatch(scores, 3);
    if (expected.ok)
      throw new Error('テストの前提が崩れている（同点のはずが終了できると判定された）');

    await expect(finishMatch(deps, { matchId: 'match-1', now: NOW })).rejects.toMatchObject({
      status: 400,
      message: expected.reason,
    });
  });

  test('勝ちゲーム数に差が付いていれば終了できる', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3 }),
      findGameScores: vi.fn().mockResolvedValue([
        { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
        { gameNumber: 2, sideAScore: 21, sideBScore: 15 },
      ]),
    });

    await finishMatch(deps, { matchId: 'match-1', now: NOW });

    expect(deps.finish).toHaveBeenCalledWith({ matchId: 'match-1', finishedAt: NOW });
  });
});
