import { describe, expect, test, vi } from 'vitest';
import { claimScorer, type ClaimScorerRepository } from '@/usecases/claim-scorer';
import type { MatchScorer } from '@/usecases/match-scorer';

const ME = 'player-me';
const NOW = new Date('2027-01-22T10:00:00Z');

function otherScorer(minutesAgo: number): MatchScorer {
  return {
    participantId: 'participant-other',
    playerId: 'player-other',
    label: '愛知北のじろう',
    lastScoredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  };
}

function fakeRepository(
  scorer: MatchScorer | null,
  overrides: Partial<ClaimScorerRepository> = {}
): ClaimScorerRepository {
  return {
    findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'live', scorer }),
    findParticipantOfPlayer: vi.fn().mockResolvedValue('participant-me'),
    setScorer: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const input = { matchId: 'match-1', playerId: ME, takeOver: false, now: NOW };

describe('担当を取る', () => {
  test('担当がいない試合では、確認なしで自分が担当になる', async () => {
    const deps = fakeRepository(null);

    const result = await claimScorer(deps, input);

    expect(deps.setScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      participantId: 'participant-me',
      expectedHolderParticipantId: null,
      now: NOW,
    });
    expect(result).toEqual({
      outcome: 'claimed',
      previousLabel: null,
      participantId: 'participant-me',
    });
  });

  test('呼出待ちの試合でも取れる（最初の 1 点の前に、1 試合に 1 回だけ押す）', async () => {
    const deps = fakeRepository(null, {
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'waiting', scorer: null }),
    });

    const result = await claimScorer(deps, input);

    expect(result.outcome).toBe('claimed');
  });

  test('ほかの人が 5 分たつ前に点を入れた試合は、引き継ぐと言わなければ 409 で取れない（理由に担当の名前）', async () => {
    const deps = fakeRepository(otherScorer(1));

    await expect(claimScorer(deps, input)).rejects.toMatchObject({
      status: 409,
      code: 'scorer-active',
      message: expect.stringContaining('愛知北のじろうさんが入力しています'),
    });
    expect(deps.setScorer).not.toHaveBeenCalled();
  });

  test('引き継ぐと明示すれば、ほかの人が担当中でも取れる。前の担当の名前が結果に入る', async () => {
    const deps = fakeRepository(otherScorer(1));

    const result = await claimScorer(deps, { ...input, takeOver: true });

    expect(deps.setScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      participantId: 'participant-me',
      // 読んだときの担当のままのときだけ書く（その間に別の人が取っていたら書かない）
      expectedHolderParticipantId: 'participant-other',
      now: NOW,
    });
    expect(result).toEqual({
      outcome: 'took-over',
      previousLabel: '愛知北のじろう',
      participantId: 'participant-me',
    });
  });

  test('5 分たった担当は、引き継ぐと言わなくても確認なしで取れる（引き継ぎとは記録しない）', async () => {
    const deps = fakeRepository(otherScorer(5));

    const result = await claimScorer(deps, input);

    expect(result.outcome).toBe('claimed');
    expect(deps.setScorer).toHaveBeenCalledTimes(1);
  });

  test('もう自分が担当なら、時刻を更新するだけで成功する（二重に押しても壊れない）', async () => {
    const mine: MatchScorer = { ...otherScorer(1), participantId: 'participant-me', playerId: ME };
    const deps = fakeRepository(mine);

    const result = await claimScorer(deps, input);

    expect(result.outcome).toBe('already-mine');
    expect(deps.setScorer).toHaveBeenCalledWith({
      matchId: 'match-1',
      participantId: 'participant-me',
      expectedHolderParticipantId: 'participant-me',
      now: NOW,
    });
  });

  test('読んでから書くまでの間にほかの人が取っていたら、409 で断る', async () => {
    const deps = fakeRepository(null, { setScorer: vi.fn().mockResolvedValue(false) });

    await expect(claimScorer(deps, input)).rejects.toMatchObject({ status: 409 });
  });

  test('終了した試合では取れない（409）', async () => {
    const deps = fakeRepository(null, {
      findMatch: vi.fn().mockResolvedValue({ id: 'match-1', status: 'done', scorer: null }),
    });

    await expect(claimScorer(deps, input)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('終了した試合'),
    });
    expect(deps.setScorer).not.toHaveBeenCalled();
  });

  test('試合が見つからなければ 404', async () => {
    const deps = fakeRepository(null, { findMatch: vi.fn().mockResolvedValue(null) });

    await expect(claimScorer(deps, input)).rejects.toMatchObject({ status: 404 });
  });

  test('その大会の参加者でない人は取れない（403）', async () => {
    const deps = fakeRepository(null, {
      findParticipantOfPlayer: vi.fn().mockResolvedValue(null),
    });

    await expect(claimScorer(deps, input)).rejects.toMatchObject({ status: 403 });
    expect(deps.setScorer).not.toHaveBeenCalled();
  });
});
