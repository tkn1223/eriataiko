import { describe, expect, test, vi } from 'vitest';
import { reopenMatch, type ReopenMatchRepository } from '@/usecases/reopen-match';
import { ApiError } from '@/server/route-helpers';

/** 「直す」を押す人（入場している人の id）。試合の担当ではない人でも押せる。 */
const ME = 'player-me';
const NOW = new Date('2026-08-30T03:00:00Z');

function fakeRepository(overrides: Partial<ReopenMatchRepository> = {}): ReopenMatchRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done' }),
    findParticipantOfPlayer: vi.fn().mockResolvedValue('participant-me'),
    reopen: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('終了の取り消しを送ると status が live に戻る', () => {
  test('done の試合には reopen が呼ばれる', async () => {
    const deps = fakeRepository();
    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.reopen).toHaveBeenCalledWith({
      matchId: 'match-1',
      scorerParticipantId: 'participant-me',
      now: NOW,
    });
  });
});

describe('棄権の印は reopen の中で消える', () => {
  test('reopen の約束は「live に戻し、finished_at と ending を元に戻す」（db 側は src/db/matches.test.ts で実測）', async () => {
    const deps = fakeRepository();
    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    // 印を消す書き込みは reopen 1 回に含まれる。別の呼び出しを増やさない
    expect(deps.reopen).toHaveBeenCalledTimes(1);
  });
});

describe('done でない試合に送ったとき', () => {
  test('waiting の試合には何もせず成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'waiting' }),
    });

    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.reopen).not.toHaveBeenCalled();
  });

  test('live の試合には何もせず成功する', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live' }),
    });

    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.reopen).not.toHaveBeenCalled();
  });
});

describe('試合が見つからないとき', () => {
  test('404 が返る', async () => {
    const deps = fakeRepository({ findMatch: vi.fn().mockResolvedValue(null) });

    await expect(
      reopenMatch(deps, { matchId: 'nope', playerId: ME, now: NOW })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reopenMatch(deps, { matchId: 'nope', playerId: ME, now: NOW })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('「直す」を押した人が、その試合の担当になる（docs/specs/2026-10-14-match-scorer.md の ⑩）', () => {
  test('前の担当が誰であっても（確認なしで）、押した人が担当になる', async () => {
    // 前の担当はこの usecase が見ない（直すのは誰でも押せて、直している間はほかの人とぶつからない）
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({
        id: 'match-1',
        status: 'done',
        scorer: { participantId: 'participant-other' },
      }),
    });

    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.reopen).toHaveBeenCalledWith(
      expect.objectContaining({ scorerParticipantId: 'participant-me', now: NOW })
    );
  });

  test('その大会の参加者でない人が押したら 403 で、終了は取り消されない', async () => {
    const deps = fakeRepository({ findParticipantOfPlayer: vi.fn().mockResolvedValue(null) });

    await expect(
      reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW })
    ).rejects.toMatchObject({ status: 403 });
    expect(deps.reopen).not.toHaveBeenCalled();
  });

  test('done でない試合では担当を変えない（何もせず成功する）', async () => {
    const deps = fakeRepository({
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live' }),
    });

    await reopenMatch(deps, { matchId: 'match-1', playerId: ME, now: NOW });

    expect(deps.reopen).not.toHaveBeenCalled();
    expect(deps.findParticipantOfPlayer).not.toHaveBeenCalled();
  });
});
