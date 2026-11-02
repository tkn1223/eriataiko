import { describe, expect, test, vi } from 'vitest';
import { releaseScorer, type ReleaseScorerRepository } from '@/usecases/release-scorer';
import type { MatchScorer } from '@/usecases/match-scorer';

const ME = 'player-me';
const NOW = new Date('2027-01-22T10:00:00Z');

const MY_SCORER: MatchScorer = {
  participantId: 'participant-me',
  playerId: ME,
  label: '愛知南のたろう',
  lastScoredAt: new Date(NOW.getTime() - 60_000),
};

const OTHER: MatchScorer = {
  participantId: 'participant-other',
  playerId: 'player-other',
  label: '愛知北のじろう',
  lastScoredAt: new Date(NOW.getTime() - 60_000),
};

function fakeRepository(
  scorer: MatchScorer | null,
  overrides: Partial<ReleaseScorerRepository> = {}
): ReleaseScorerRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', scorer }),
    clearScorer: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const input = { matchId: 'match-1', playerId: ME, now: NOW };

describe('担当をやめる', () => {
  test('自分が担当なら、担当が外れる', async () => {
    const deps = fakeRepository(MY_SCORER);

    const result = await releaseScorer(deps, input);

    expect(deps.clearScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      expectedHolderParticipantId: 'participant-me',
    });
    expect(result).toEqual({ outcome: 'released' });
  });

  test('自分の担当が 5 分たっていても、やめられる', async () => {
    const deps = fakeRepository({
      ...MY_SCORER,
      lastScoredAt: new Date(NOW.getTime() - 60 * 60_000),
    });

    const result = await releaseScorer(deps, input);

    expect(result.outcome).toBe('released');
  });

  test('ほかの人が担当中なら、やめられない（409・理由に担当の名前）。ほかの人の担当は外れない', async () => {
    const deps = fakeRepository(OTHER);

    await expect(releaseScorer(deps, input)).rejects.toMatchObject({
      status: 409,
      code: 'not-scorer',
      message: expect.stringContaining('愛知北のじろうさんが担当しています'),
    });
    expect(deps.clearScorer).not.toHaveBeenCalled();
  });

  test('すでに誰も担当でなければ、何もせず成功する（二重に押されても壊れない）', async () => {
    const deps = fakeRepository(null);

    const result = await releaseScorer(deps, input);

    expect(result).toEqual({ outcome: 'already-vacant' });
    expect(deps.clearScorer).not.toHaveBeenCalled();
  });

  test('ほかの人の担当が 5 分たって外れていれば、何もせず成功する', async () => {
    const deps = fakeRepository({
      ...OTHER,
      lastScoredAt: new Date(NOW.getTime() - 5 * 60_000),
    });

    const result = await releaseScorer(deps, input);

    expect(result.outcome).toBe('already-vacant');
    expect(deps.clearScorer).not.toHaveBeenCalled();
  });

  test('読んでから書くまでの間にほかの人に移っていたら、409 で断る', async () => {
    const deps = fakeRepository(MY_SCORER, { clearScorer: vi.fn().mockResolvedValue(false) });

    await expect(releaseScorer(deps, input)).rejects.toMatchObject({ status: 409 });
  });

  test('試合が見つからなければ 404', async () => {
    const deps = fakeRepository(null, { findMatch: vi.fn().mockResolvedValue(null) });

    await expect(releaseScorer(deps, input)).rejects.toMatchObject({ status: 404 });
  });
});
