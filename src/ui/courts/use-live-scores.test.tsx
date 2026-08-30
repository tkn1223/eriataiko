import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

/**
 * 本物の Supabase を立てずに Realtime の中身を確かめるための偽物。
 * `.on(event, filter, handler)` で登録されたハンドラと `.subscribe(cb)` のコールバックを
 * テストから直接呼べるように、モジュールの外に逃がしておく。
 */
type Handler = (payload: { new?: unknown; old?: unknown }) => void;

vi.mock('@/db/client', () => {
  const handlersByTable: Record<string, Handler> = {};
  let subscribeCallback: ((status: string) => void) | null = null;
  const removeChannel = vi.fn();

  const channel = {
    on: vi.fn((_event: string, filter: { table: string }, handler: Handler) => {
      handlersByTable[filter.table] = handler;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscribeCallback = callback;
      return channel;
    }),
  };

  return {
    getSupabaseBrowserClient: () => ({
      channel: vi.fn(() => channel),
      removeChannel,
    }),
    __test: {
      handlersByTable,
      removeChannel,
      triggerSubscribeStatus: (status: string) => subscribeCallback?.(status),
    },
  };
});

const { useLiveScores } = await import('@/ui/courts/use-live-scores');
// vi.mock で足した __test だけの出口。型は無いので unknown 経由で受け取る。
const dbClientModule = (await import('@/db/client')) as unknown as {
  __test: {
    handlersByTable: Record<string, Handler>;
    removeChannel: ReturnType<typeof vi.fn>;
    triggerSubscribeStatus: (status: string) => void;
  };
};
const { handlersByTable, removeChannel, triggerSubscribeStatus } = dbClientModule.__test;

beforeEach(() => {
  refreshMock.mockClear();
  removeChannel.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveScores', () => {
  test('game_scores の変化は読み直さず、届いた値をそのまま onGameScoreChange に渡す', () => {
    const onGameScoreChange = vi.fn();
    renderHook(() => useLiveScores({ onGameScoreChange }));

    act(() =>
      handlersByTable.game_scores({
        new: { match_id: 'm1', game_number: 1, side_a_score: 9, side_b_score: 6 },
      })
    );

    expect(onGameScoreChange).toHaveBeenCalledWith({
      matchId: 'm1',
      gameNumber: 1,
      sideAScore: 9,
      sideBScore: 6,
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test('matches の変化は 0.5 秒ぶんまとめて 1 回だけ router.refresh() を呼ぶ', () => {
    vi.useFakeTimers();
    renderHook(() => useLiveScores({ onGameScoreChange: vi.fn() }));

    act(() => {
      handlersByTable.matches({ new: { id: 'm1', status: 'live' } });
      handlersByTable.matches({ new: { id: 'm2', status: 'live' } });
      handlersByTable.matches({ new: { id: 'm3', status: 'live' } });
    });

    expect(refreshMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  test('SUBSCRIBED になると connectionStatus が connected になる', () => {
    const { result } = renderHook(() => useLiveScores({ onGameScoreChange: vi.fn() }));

    act(() => triggerSubscribeStatus('SUBSCRIBED'));
    expect(result.current.connectionStatus).toBe('connected');
  });

  test.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    '%s になると connectionStatus が disconnected になる',
    (status) => {
      const { result } = renderHook(() => useLiveScores({ onGameScoreChange: vi.fn() }));

      act(() => triggerSubscribeStatus('SUBSCRIBED'));
      act(() => triggerSubscribeStatus(status));
      expect(result.current.connectionStatus).toBe('disconnected');
    }
  );

  test('切れても、取りこぼしを埋めるための読み直しはしない', () => {
    renderHook(() => useLiveScores({ onGameScoreChange: vi.fn() }));

    act(() => triggerSubscribeStatus('SUBSCRIBED'));
    act(() => triggerSubscribeStatus('CLOSED'));

    expect(refreshMock).not.toHaveBeenCalled();
  });

  test('片付けるときに removeChannel が呼ばれる', () => {
    const { unmount } = renderHook(() => useLiveScores({ onGameScoreChange: vi.fn() }));

    unmount();
    expect(removeChannel).toHaveBeenCalled();
  });
});
