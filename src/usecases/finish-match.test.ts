import { describe, expect, test, vi } from 'vitest';
import {
  finishMatch,
  finishMatchBodySchema,
  type FinishMatchRepository,
} from '@/usecases/finish-match';
import { parseBody } from '@/server/route-helpers';
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

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'normal',
    });
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

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'normal',
    });
  });
});

describe('棄権を選んだ終了（docs/specs/2026-10-11-retire-match.md）', () => {
  test('retiredSide が A なら ending は retired_side_a で書かれる（点数で勝っていても止まらない）', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', now: NOW, retiredSide: 'A' });

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'retired_side_a',
    });
  });

  test('retiredSide が B なら ending は retired_side_b で書かれる', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', now: NOW, retiredSide: 'B' });

    expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ ending: 'retired_side_b' }));
  });

  test('retiredSide が無ければ普通', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', now: NOW, retiredSide: undefined });

    expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ ending: 'normal' }));
  });

  test('同点のときは、棄権を選んでも 400 で止まる', async () => {
    const deps = fakeRepository({
      findGameScores: vi
        .fn()
        .mockResolvedValue([{ gameNumber: 1, sideAScore: 15, sideBScore: 15 }]),
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 1 }),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', now: NOW, retiredSide: 'A' })
    ).rejects.toMatchObject({ status: 400, message: '同点では終了できません' });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('既に done なら、棄権を付けて送り直されても何も書き換えない', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    });

    await finishMatch(deps, { matchId: 'match-1', now: NOW, retiredSide: 'A' });

    expect(deps.finish).not.toHaveBeenCalled();
  });
});

describe('終了の本文の検査（finishMatchBodySchema）', () => {
  function requestWith(body: unknown) {
    return new Request('http://localhost/api/matches/x/result', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  test('retiredSide は A か B なら通り、無くても通る', async () => {
    await expect(
      parseBody(requestWith({ retiredSide: 'A' }), finishMatchBodySchema)
    ).resolves.toEqual({
      retiredSide: 'A',
    });
    await expect(parseBody(requestWith({}), finishMatchBodySchema)).resolves.toEqual({});
  });

  test('retiredSide が A / B 以外なら 400 と日本語のエラー', async () => {
    await expect(
      parseBody(requestWith({ retiredSide: 'C' }), finishMatchBodySchema)
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('棄権') });
  });
});
