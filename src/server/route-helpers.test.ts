import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/server/session', () => ({ getSession: vi.fn() }));

import { ApiError, requirePlayer, toErrorResponse } from '@/server/route-helpers';
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

/**
 * 画面は `error`（日本語の理由）に加えて、`code` で「担当でないから断られた」を見分ける
 * （同じ 409 でも「終了した試合です」とは出し方が違うため。docs/specs/2026-10-14-match-scorer.md）。
 */
describe('toErrorResponse', () => {
  test('ApiError の状態番号と日本語の理由を返す（code が無ければ code は付けない）', async () => {
    const response = toErrorResponse(new ApiError(409, '終了した試合です。'));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: '終了した試合です。' });
  });

  test('code を付けた ApiError は、本文に code も入る', async () => {
    const response = toErrorResponse(
      new ApiError(409, '愛知南のたろうさんが担当しています。', 'not-scorer')
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: '愛知南のたろうさんが担当しています。',
      code: 'not-scorer',
    });
  });
});
