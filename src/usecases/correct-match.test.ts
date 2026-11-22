import { describe, expect, test, vi } from 'vitest';
import {
  correctMatch,
  correctMatchBodySchema,
  type CorrectMatchRepository,
} from '@/usecases/correct-match';

const NOW = new Date('2026-11-22T02:00:00Z');

function fakeRepository(overrides: Partial<CorrectMatchRepository> = {}): CorrectMatchRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done', maxGameCount: 3 }),
    writeCorrection: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const TWO_GAMES = [
  { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
  { gameNumber: 2, sideAScore: 17, sideBScore: 21 },
  { gameNumber: 3, sideAScore: 21, sideBScore: 19 },
];

function correct(
  deps: CorrectMatchRepository,
  scores = TWO_GAMES,
  retiredSide: 'A' | 'B' | null = null
) {
  return correctMatch(deps, { matchId: 'match-1', scores, retiredSide, now: NOW });
}

describe('終わった試合の訂正', () => {
  test('送られた全ゲームの点と棄権の印がそのまま書かれる', async () => {
    const deps = fakeRepository();
    await correct(deps, TWO_GAMES, 'B');

    expect(deps.writeCorrection).toHaveBeenCalledWith({
      matchId: 'match-1',
      scores: TWO_GAMES,
      ending: 'retired_side_b',
      now: NOW,
    });
  });

  test('棄権なし（null）は普通の終わり方で書かれる', async () => {
    const deps = fakeRepository();
    await correct(deps);
    expect(deps.writeCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ ending: 'normal' })
    );
  });

  test('ゲームを消すときは 0 対 0 で送ればそのまま書かれる', async () => {
    const deps = fakeRepository();
    const scores = [
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
    ];
    await correct(deps, scores);
    expect(deps.writeCorrection).toHaveBeenCalledWith(expect.objectContaining({ scores }));
  });
});

describe('断るとき（何も書かない）', () => {
  test('試合が無ければ 404', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });
    await expect(correct(deps)).rejects.toMatchObject({ status: 404 });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test.each(['waiting', 'live'])(
    '終わっていない試合（%s）は 409 で試合速報を案内する',
    async (status) => {
      const deps = fakeRepository({
        findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status, maxGameCount: 3 }),
      });
      await expect(correct(deps)).rejects.toMatchObject({
        status: 409,
        message: 'この試合はまだ終わっていません。試合中の点は試合速報で直してください。',
      });
      expect(deps.writeCorrection).not.toHaveBeenCalled();
    }
  );

  test('ゲーム番号が 1 未満なら 400', async () => {
    const deps = fakeRepository();
    await expect(
      correct(deps, [{ gameNumber: 0, sideAScore: 21, sideBScore: 1 }])
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test('ゲーム番号が上限（max_game_count）を超えたら 400', async () => {
    const deps = fakeRepository();
    await expect(
      correct(deps, [{ gameNumber: 4, sideAScore: 21, sideBScore: 1 }])
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test('ゲーム番号が重複したら 400', async () => {
    const deps = fakeRepository();
    await expect(
      correct(deps, [
        { gameNumber: 1, sideAScore: 21, sideBScore: 1 },
        { gameNumber: 1, sideAScore: 21, sideBScore: 2 },
      ])
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test('1 点も無ければ 400', async () => {
    const deps = fakeRepository();
    await expect(
      correct(deps, [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }])
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test('同点（勝ちゲーム数が同じ）なら 400 で、終了と同じ理由が出る', async () => {
    const deps = fakeRepository();
    await expect(
      correct(deps, [
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
      ])
    ).rejects.toMatchObject({ status: 400, message: '同点では終了できません' });
    expect(deps.writeCorrection).not.toHaveBeenCalled();
  });

  test('書こうとしたとき、試合が試合中に戻っていたら 409（試合速報へ案内）', async () => {
    const deps = fakeRepository({ writeCorrection: vi.fn().mockResolvedValue(false) });
    await expect(correct(deps)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('試合速報'),
    });
  });
});

describe('本文の形', () => {
  test('点が負・小数・棄権が A B null 以外なら通らない', () => {
    const ok = { scores: TWO_GAMES, retiredSide: null };
    expect(correctMatchBodySchema.safeParse(ok).success).toBe(true);
    expect(
      correctMatchBodySchema.safeParse({
        ...ok,
        scores: [{ gameNumber: 1, sideAScore: -1, sideBScore: 3 }],
      }).success
    ).toBe(false);
    expect(
      correctMatchBodySchema.safeParse({
        ...ok,
        scores: [{ gameNumber: 1, sideAScore: 1.5, sideBScore: 3 }],
      }).success
    ).toBe(false);
    expect(correctMatchBodySchema.safeParse({ ...ok, retiredSide: 'C' }).success).toBe(false);
  });
});
