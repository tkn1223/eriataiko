import { describe, expect, test, vi } from 'vitest';
import { saveScore, type SaveScoreRepository } from '@/usecases/save-score';
import { ApiError } from '@/server/route-helpers';
import type { MatchScorer } from '@/usecases/match-scorer';

/** 点を送る人（入場している人の id）。 */
const ME = 'player-me';
const NOW = new Date('2026-08-30T01:00:00Z');

/** 自分が担当の試合（直前に点を入れた）。ほとんどのテストの前提。 */
const MY_SCORER: MatchScorer = {
  participantId: 'participant-me',
  playerId: ME,
  label: '愛知南のたろう',
  lastScoredAt: new Date(NOW.getTime() - 60_000),
};

/** ほかの人が担当の試合（`minutesAgo` 分前に点を入れた）。 */
function otherScorer(minutesAgo: number): MatchScorer {
  return {
    participantId: 'participant-other',
    playerId: 'player-other',
    label: '愛知北のじろう',
    lastScoredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  };
}

/** テストのたびに書き換える必要が無い、素直な「1 ゲーム目・3 ゲームまで・waiting・自分が担当」の試合。 */
function fakeRepository(overrides: Partial<SaveScoreRepository> = {}): SaveScoreRepository {
  return {
    findMatch: vi
      .fn()
      .mockResolvedValue({ id: 'match-1', status: 'waiting', maxGameCount: 3, scorer: MY_SCORER }),
    saveGameScore: vi.fn().mockResolvedValue(undefined),
    markLive: vi.fn().mockResolvedValue(undefined),
    findParticipantOfPlayer: vi.fn().mockResolvedValue('participant-me'),
    setScorer: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('得点を送ると game_scores が保存される', () => {
  test('見つかった試合に対して saveGameScore が呼ばれる', async () => {
    const deps = fakeRepository();
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      playerId: ME,
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
      playerId: ME,
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
      playerId: ME,
      now: NOW,
    });

    expect(deps.markLive).not.toHaveBeenCalled();
  });

  test('すでに live な試合には markLive を呼ばない（無駄な書き込みをしない）', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: MY_SCORER }),
    });
    await saveScore(deps, {
      matchId: 'match-1',
      gameNumber: 1,
      sideAScore: 21,
      sideBScore: 15,
      playerId: ME,
      now: NOW,
    });

    expect(deps.markLive).not.toHaveBeenCalled();
  });
});

describe('gameNumber の範囲チェック', () => {
  test('max_game_count が 1 の試合に 2 ゲーム目を送ると 400', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'waiting',
        maxGameCount: 1,
        scorer: MY_SCORER,
      }),
    });

    await expect(
      saveScore(deps, {
        matchId: 'match-1',
        gameNumber: 2,
        sideAScore: 1,
        sideBScore: 0,
        playerId: ME,
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });

  test('gameNumber が 0 のとき 400', async () => {
    const deps = fakeRepository();
    await expect(
      saveScore(deps, {
        matchId: 'match-1',
        gameNumber: 0,
        sideAScore: 1,
        sideBScore: 0,
        playerId: ME,
        now: NOW,
      })
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
        playerId: ME,
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });
    await expect(
      saveScore(deps, {
        matchId: 'nope',
        gameNumber: 1,
        sideAScore: 1,
        sideBScore: 0,
        playerId: ME,
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('done の試合に得点を送ったとき', () => {
  test('409 が返り、保存されない', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'done', maxGameCount: 3, scorer: MY_SCORER }),
    });

    await expect(
      saveScore(deps, {
        matchId: 'match-1',
        gameNumber: 1,
        sideAScore: 1,
        sideBScore: 0,
        playerId: ME,
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });
});

describe('ApiError を投げる', () => {
  test('404 は ApiError のインスタンス', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });
    await expect(
      saveScore(deps, {
        matchId: 'nope',
        gameNumber: 1,
        sideAScore: 1,
        sideBScore: 0,
        playerId: ME,
        now: NOW,
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('担当の確かめ', () => {
  const input = {
    matchId: 'match-1',
    gameNumber: 1,
    sideAScore: 12,
    sideBScore: 10,
    playerId: ME,
    now: NOW,
  };

  test('担当でない人から点が届いても保存されず、いまの担当の点が残る（409・理由に担当の名前）', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: otherScorer(1),
      }),
    });

    const rejected = saveScore(deps, input);

    await expect(rejected).rejects.toMatchObject({
      status: 409,
      code: 'not-scorer',
      message: expect.stringContaining('愛知北のじろうさんが担当しています'),
    });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
    expect(deps.setScorer).not.toHaveBeenCalled();
  });

  test('ちょうど 5 分たつ前なら、ほかの人の担当のまま断る', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: otherScorer(4.9),
      }),
    });

    await expect(saveScore(deps, input)).rejects.toMatchObject({ status: 409 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });

  test('担当の人の点は保存される。担当の欄は書かない（最後に点を入れた時刻は点の保存時刻で表す）', async () => {
    const deps = fakeRepository();

    const result = await saveScore(deps, input);

    expect(deps.saveGameScore).toHaveBeenCalledWith(expect.objectContaining({ now: NOW }));
    // matches を書くと、全員の画面への知らせが 1 点あたり 2 通になる
    expect(deps.setScorer).not.toHaveBeenCalled();
    expect(deps.findParticipantOfPlayer).not.toHaveBeenCalled();
    expect(result).toEqual({ scorerClaimed: false });
  });

  test('自分の担当が 5 分たっていても、ほかの人が取っていなければ自分のまま保存できる', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: { ...MY_SCORER, lastScoredAt: new Date(NOW.getTime() - 30 * 60_000) },
      }),
    });

    await saveScore(deps, input);

    expect(deps.saveGameScore).toHaveBeenCalledTimes(1);
  });

  test('担当がいない試合に点が届いたら、送ってきた人を担当にして保存する', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: null }),
    });

    const result = await saveScore(deps, input);

    expect(deps.setScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      participantId: 'participant-me',
      expectedHolderParticipantId: null,
      now: NOW,
    });
    expect(deps.saveGameScore).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scorerClaimed: true });
  });

  test('ほかの人の担当が 5 分たって外れていたら、送ってきた人を担当にして保存する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'live',
        maxGameCount: 3,
        scorer: otherScorer(5),
      }),
    });

    const result = await saveScore(deps, input);

    expect(deps.setScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      participantId: 'participant-me',
      // 外れた担当を引き継ぐ形で書く（その間に別の人が取っていたら書かない）
      expectedHolderParticipantId: 'participant-other',
      now: NOW,
    });
    expect(deps.saveGameScore).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scorerClaimed: true });
  });

  test('読んでから書くまでの間に担当がほかの人に移ったら、点は保存せず 409 で断る', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: null }),
      setScorer: vi.fn().mockResolvedValue(false),
    });

    await expect(saveScore(deps, input)).rejects.toMatchObject({ status: 409, code: 'not-scorer' });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });

  test('この大会の参加者でない人は担当になれず、点も保存されない（403）', async () => {
    const deps = fakeRepository({
      findMatch: vi
        .fn()
        .mockResolvedValue({ id: 'match-1', status: 'live', maxGameCount: 3, scorer: null }),
      findParticipantOfPlayer: vi.fn().mockResolvedValue(null),
    });

    await expect(saveScore(deps, input)).rejects.toMatchObject({ status: 403 });
    expect(deps.saveGameScore).not.toHaveBeenCalled();
  });

  test('終了した試合は、担当の確かめより先に 409（終了した試合です）で断る', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'done',
        maxGameCount: 3,
        scorer: otherScorer(1),
      }),
    });

    await expect(saveScore(deps, input)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('終了した試合'),
    });
  });
});
