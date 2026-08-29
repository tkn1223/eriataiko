import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { ApiError, requirePlayer } from '@/server/route-helpers';
import { getSession, type Session } from '@/server/session';

const mockedGetSession = vi.mocked(getSession);

const player: Session = {
  role: 'player',
  playerId: '00000000-0000-4000-8000-000000000001',
  playerName: 'さとう',
  playerNumber: 1,
};

beforeEach(() => {
  mockedGetSession.mockReset();
});

/**
 * 書き込み系 API の入口。
 *
 * **観戦者をここで止めるのが要。** 観戦者は合言葉を通しておらず、誰かも
 * 名乗っていないので、書き込みの記録（write_logs）に残す名前が無い。
 * ここが緩むと「誰が書いたか分からない書き込み」が通ってしまう。
 */
describe('requirePlayer', () => {
  test('入場していない人は 401', async () => {
    mockedGetSession.mockResolvedValue(null);

    await expect(requirePlayer()).rejects.toMatchObject({ status: 401 });
    await expect(requirePlayer()).rejects.toBeInstanceOf(ApiError);
  });

  test('観戦者は 403（見るだけの人に書かせない）', async () => {
    mockedGetSession.mockResolvedValue({ role: 'viewer' });

    await expect(requirePlayer()).rejects.toMatchObject({ status: 403 });
  });

  test('観戦者に返す理由には、どうすれば書けるかが書いてある', async () => {
    mockedGetSession.mockResolvedValue({ role: 'viewer' });

    await expect(requirePlayer()).rejects.toThrow(/名前を選んで入場/);
  });

  test('名前で入場した人はそのまま通る', async () => {
    mockedGetSession.mockResolvedValue(player);

    await expect(requirePlayer()).resolves.toEqual(player);
  });
});
