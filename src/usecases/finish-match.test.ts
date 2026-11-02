import { describe, expect, test, vi } from 'vitest';
import {
  finishMatch,
  finishMatchBodySchema,
  type FinishMatchRepository,
} from '@/usecases/finish-match';
import { parseBody } from '@/server/route-helpers';
import { canFinishMatch } from '@/domain/match-rules';
import { ApiError } from '@/server/route-helpers';
import type { MatchScorer } from '@/usecases/match-scorer';

/** 終了を押す人（入場している人の id）。 */
const ME = 'player-me';

/** 自分が担当の試合。ほとんどのテストの前提（試合の終了は担当だけが押せる）。 */
const MY_SCORER: MatchScorer = {
  participantId: 'participant-me',
  playerId: ME,
  label: '愛知南のたろう',
  lastScoredAt: new Date('2026-08-30T01:59:00Z'),
};

function fakeRepository(overrides: Partial<FinishMatchRepository> = {}): FinishMatchRepository {
  return {
    findMatch: vi
      .fn()
      .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: MY_SCORER }),
    findGameScores: vi.fn().mockResolvedValue([{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }]),
    finish: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const NOW = new Date('2026-08-30T02:00:00Z');

describe('終了を送ると status が done になる', () => {
  test('finish が finishedAt 付きで呼ばれる', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'normal',
      expectedScorerParticipantId: 'participant-me',
    });
  });
});

describe('1 点も入っていない試合に終了を送ったとき', () => {
  test('400 が返り、finish は呼ばれない', async () => {
    const deps = fakeRepository({
      findGameScores: vi.fn().mockResolvedValue([{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }]),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('ゲームが 1 件も無い試合でも 400', async () => {
    const deps = fakeRepository({ findGameScores: vi.fn().mockResolvedValue([]) });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('既に done の試合に終了を送ったとき', () => {
  test('二重に押しても何も変えずに成功する（finish を呼ばない）', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.finish).not.toHaveBeenCalled();
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });

    await expect(
      finishMatch(deps, { matchId: 'nope', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      finishMatch(deps, { matchId: 'nope', playerId: ME, now: NOW })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('同点（勝ちゲーム数が同数）の試合に終了を送ったとき（PR #52 レビュー指摘4）', () => {
  test('400 が返り、finish は呼ばれない', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: MY_SCORER }),
      findGameScores: vi.fn().mockResolvedValue([
        { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
        { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
      ]),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
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
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: MY_SCORER }),
      findGameScores: vi.fn().mockResolvedValue(scores),
    });

    const expected = canFinishMatch(scores, 3);
    if (expected.ok)
      throw new Error('テストの前提が崩れている（同点のはずが終了できると判定された）');

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
      status: 400,
      message: expected.reason,
    });
  });

  test('勝ちゲーム数に差が付いていれば終了できる', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: MY_SCORER }),
      findGameScores: vi.fn().mockResolvedValue([
        { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
        { gameNumber: 2, sideAScore: 21, sideBScore: 15 },
      ]),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'normal',
      expectedScorerParticipantId: 'participant-me',
    });
  });
});

describe('棄権を選んだ終了（docs/specs/2026-10-11-retire-match.md）', () => {
  test('retiredSide が A なら ending は retired_side_a で書かれる（点数で勝っていても止まらない）', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW, retiredSide: 'A' });

    expect(deps.finish).toHaveBeenCalledWith({
      matchId: 'match-1',
      finishedAt: NOW,
      ending: 'retired_side_a',
      expectedScorerParticipantId: 'participant-me',
    });
  });

  test('retiredSide が B なら ending は retired_side_b で書かれる', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW, retiredSide: 'B' });

    expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ ending: 'retired_side_b' }));
  });

  test('retiredSide が無ければ普通', async () => {
    const deps = fakeRepository();
    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW, retiredSide: undefined });

    expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ ending: 'normal' }));
  });

  test('同点のときは、棄権を選んでも 400 で止まる', async () => {
    const deps = fakeRepository({
      findGameScores: vi
        .fn()
        .mockResolvedValue([{ gameNumber: 1, sideAScore: 15, sideBScore: 15 }]),
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 1, scorer: MY_SCORER }),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW, retiredSide: 'A' })
    ).rejects.toMatchObject({ status: 400, message: '同点では終了できません' });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('既に done なら、棄権を付けて送り直されても何も書き換えない', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW, retiredSide: 'A' });

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

describe('試合の終了は担当だけ（docs/specs/2026-10-14-match-scorer.md の ⑦）', () => {
  const OTHER: MatchScorer = {
    participantId: 'participant-other',
    playerId: 'player-other',
    label: '愛知北のじろう',
    lastScoredAt: new Date('2026-08-30T01:59:00Z'),
  };

  test('ほかの人が担当中なら 409 で断り、理由にいまの担当の名前が入る。終了は書かれない', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: OTHER }),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({
      status: 409,
      code: 'not-scorer',
      message: expect.stringContaining('愛知北のじろうさんが担当しています'),
    });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('担当がいない試合も、担当でない人は終了できない（先に担当を取ってもらう）', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: null }),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({ status: 409, code: 'not-scorer' });
    expect(deps.finish).not.toHaveBeenCalled();
  });

  test('ほかの人の担当が 5 分たって外れていても、終了は担当（取った人）だけ', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: { ...OTHER, lastScoredAt: new Date('2026-08-30T01:55:00Z') },
      }),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({ status: 409, code: 'not-scorer' });
  });

  test('自分の担当が 5 分たっていても、取られていなければ自分が終了できる', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: { ...MY_SCORER, lastScoredAt: new Date('2026-08-30T00:00:00Z') },
      }),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.finish).toHaveBeenCalledTimes(1);
  });

  test('読んでから書くまでの間に引き継がれたら、終了は書かれず 409 で断る', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'match-1',
          status: 'live',
          maxGameCount: 3,
          scorer: MY_SCORER,
        })
        .mockResolvedValueOnce({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: OTHER }),
      finish: vi.fn().mockResolvedValue(false),
    });

    await expect(
      finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({ status: 409, code: 'not-scorer' });
  });

  test('読んでから書くまでの間に同じ試合がもう終わっていたら、二重の終了として成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'match-1',
          status: 'live',
          maxGameCount: 3,
          scorer: MY_SCORER,
        })
        .mockResolvedValueOnce({
          id: 'match-1',
          status: 'done',
          maxGameCount: 3,
          scorer: MY_SCORER,
        }),
      finish: vi.fn().mockResolvedValue(false),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });
  });

  test('すでに終了した試合への二重の終了は、担当でなくても何もせず成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done', scorer: OTHER }),
    });

    await finishMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.finish).not.toHaveBeenCalled();
  });
});
