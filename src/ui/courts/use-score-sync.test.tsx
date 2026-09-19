import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useScoreSync } from '@/ui/courts/use-score-sync';

/**
 * `use-score-sync.ts` のテスト。DOM（window の beforeunload・タイマー）が要るので
 * `.test.tsx`（jsdom）で動かす。fetch を差し替えて失敗・再送を再現する
 * （仕様の「つくりの方針」）。
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useScoreSync', () => {
  test('sync で押した「いまの点数」をそのまま POST する', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'match-1', gameNumber: 1, sideAScore: 5, sideBScore: 3 });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/matches/match-1/scores');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      gameNumber: 1,
      sideAScore: 5,
      sideBScore: 3,
    });
  });

  test('同じ試合・同じゲームは送信中は1本だけ。返事のあとに最新の値をもう1回送る', async () => {
    const fetchMock = vi.mocked(fetch);
    let resolveFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    // 返事が来る前に連打（10連打を模して、値だけどんどん更新する）
    act(() => {
      for (let score = 2; score <= 10; score += 1) {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: score, sideBScore: 0 });
      }
    });

    // 送信中は 1 本だけ（連打しても増えない）
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(jsonResponse(200, { ok: true }));
    });

    // 返事が来た時点で値が変わっているので、最新の値をもう1回送る
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, secondInit] = fetchMock.mock.calls[1];
    expect(JSON.parse(secondInit?.body as string)).toEqual({
      gameNumber: 1,
      sideAScore: 10,
      sideBScore: 0,
    });
  });

  test('つながらない（fetch が失敗する）ときは、間隔を空けて自動で送り直す', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBe(
      '保存できていません・送り直しています'
    );

    // 1 秒後に 2 回目
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBe(
      '保存できていません・送り直しています'
    );

    // 2 秒後（1 回目の失敗からの合計 1+2 秒）に 3 回目。成功して案内が消える。
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
  });

  test('5xx・429 も自動で送り直す', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { error: 'サーバー側でエラーが起きました。' }))
      .mockResolvedValueOnce(jsonResponse(429, { error: '混み合っています。' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBe(
      '保存できていません・送り直しています'
    );
    expect(result.current.statusByMatchId['m']?.rejectedMessage).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
  });

  test('4xx（例: 409 終了済み）は送り直さず、応答の日本語の理由を出す', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: '終了した試合です。先に「終了を取り消す」を押してください。',
      })
    );

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.statusByMatchId['m']?.rejectedMessage).toBe(
      '終了した試合です。先に「終了を取り消す」を押してください。'
    );
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();

    // 10 秒待っても送り直さない
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('理由が本文から取れない4xxは既定の日本語を出す', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response('not json', { status: 400 }));

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.rejectedMessage).toBe(
        '保存できませんでした。画面を更新してから確認してください。'
      )
    );
  });

  test('保存できたら案内が消える', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
    expect(result.current.statusByMatchId['m']?.rejectedMessage).toBeNull();
  });

  test('別の試合・別のゲームは、それぞれ独立に送る（片方の送信中でももう片方は待たない）', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm1', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      result.current.sync({ matchId: 'm1', gameNumber: 2, sideAScore: 1, sideBScore: 0 });
      result.current.sync({ matchId: 'm2', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('送り直しを待っている間に押しても、保存できるまで「送り直しています」は消えない', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 2, sideBScore: 0 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBe(
      '保存できていません・送り直しています'
    );
  });

  test('画面を離れたら、送り直しをやめる（返事待ちの送信が戻ってきても次を送らない）', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    let rejectFirst!: (error: Error) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        })
    );
    const { result, unmount } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    unmount();
    rejectFirst(new Error('network down'));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('beforeunload（送れていない点があるまま閉じようとしたときの確認）', () => {
    function dispatchBeforeUnload(): boolean {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    test('保存できていない間は確認が出る（4xx で断られたまま）', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(jsonResponse(404, { error: '見つかりません。' }));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await waitFor(() =>
        expect(result.current.statusByMatchId['m']?.rejectedMessage).toBeTruthy()
      );

      expect(dispatchBeforeUnload()).toBe(true);
    });

    test('保存できていれば確認は出ない', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      expect(dispatchBeforeUnload()).toBe(false);
    });

    test('何も操作していなければ確認は出ない', () => {
      renderHook(() => useScoreSync());
      expect(dispatchBeforeUnload()).toBe(false);
    });
  });
});
