import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { appScoreSyncStore, useScoreSync } from '@/ui/courts/use-score-sync';

/**
 * `use-score-sync.ts` のテスト。DOM（window の beforeunload・タイマー）が要るので
 * `.test.tsx`（jsdom）で動かす。fetch を差し替えて失敗・再送を再現する
 * （仕様の「つくりの方針」）。
 *
 * 預かる場所はアプリ全体で 1 つ（`appScoreSyncStore`）なので、テストのあいだに前のテストの
 * 点や送り直しのタイマーが残らないよう、前後で `dispose()` して空にする。
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  appScoreSyncStore.dispose();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  appScoreSyncStore.dispose();
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

  // 仕様 2026-10-04: 送れていない点を預かる場所は画面（フック）より長生きする。
  // 「画面を離れたら送り直しをやめる」は、点が黙って消える原因だったのでやめた。
  describe('預かる場所はアプリ全体で 1 つ（画面を離れても送り続ける）', () => {
    test('画面を離れても、送り直しを続けて、送れたらデータベースに届く', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const { result, unmount } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      unmount();
      await vi.advanceTimersByTimeAsync(1000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
        gameNumber: 1,
        sideAScore: 3,
        sideBScore: 1,
      });
    });

    test('2 つの画面（フック）は同じ預かり場所を見ている', () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const first = renderHook(() => useScoreSync());
      const second = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });

      expect(second.result.current.statusByMatchId['m']?.unsentScores).toEqual([
        { gameNumber: 1, sideAScore: 1, sideBScore: 0 },
      ]);
    });

    test('離れて戻ってきた画面は、送れていない点を未送信の数字と案内つきで受け取る', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      first.unmount();

      const returned = renderHook(() => useScoreSync());

      expect(returned.result.current.statusByMatchId['m']).toEqual({
        retryingMessage: '保存できていません・送り直しています',
        rejectedMessage: null,
        unsentScores: [{ gameNumber: 1, sideAScore: 3, sideBScore: 1 }],
      });
    });

    test('離れている間に送り直しが成功したら、戻ってきた画面に案内も未送信も無い', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      first.unmount();
      await vi.advanceTimersByTimeAsync(1000);

      const returned = renderHook(() => useScoreSync());

      expect(returned.result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
      expect(returned.result.current.statusByMatchId['m']?.unsentScores).toEqual([]);
    });

    test('離れている間に返事が戻ってきても（成功）、印が付け替わる', async () => {
      let resolveFirst!: (response: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      first.unmount();
      await act(async () => {
        resolveFirst(jsonResponse(200, { ok: true }));
      });

      const returned = renderHook(() => useScoreSync());
      expect(returned.result.current.statusByMatchId['m']?.unsentScores).toEqual([]);
      expect(returned.result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
    });

    test('離れている間に返事が戻ってきても（失敗）、送り直しの印が付き、次の送り直しも仕掛ける', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      let rejectFirst!: (error: Error) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          })
      );
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      first.unmount();
      rejectFirst(new Error('network down'));
      await vi.advanceTimersByTimeAsync(0);

      const returned = renderHook(() => useScoreSync());
      expect(returned.result.current.statusByMatchId['m']?.retryingMessage).toBe(
        '保存できていません・送り直しています'
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(returned.result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
    });

    test('入口に断られた点も、離れて戻ると未送信の数字と理由つきで受け取る', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { error: '終了した試合です。' }));
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      await waitFor(() =>
        expect(first.result.current.statusByMatchId['m']?.rejectedMessage).toBe(
          '終了した試合です。'
        )
      );
      first.unmount();

      const returned = renderHook(() => useScoreSync());
      expect(returned.result.current.statusByMatchId['m']).toEqual({
        retryingMessage: null,
        rejectedMessage: '終了した試合です。',
        unsentScores: [{ gameNumber: 1, sideAScore: 3, sideBScore: 1 }],
      });
    });

    test('未送信の数字は、送信中のあいだも含めて、保存できたら無くなる', async () => {
      let resolveFirst!: (response: Response) => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      });
      expect(result.current.statusByMatchId['m']?.unsentScores).toHaveLength(1);

      await act(async () => {
        resolveFirst(jsonResponse(200, { ok: true }));
      });
      expect(result.current.statusByMatchId['m']?.unsentScores).toEqual([]);
    });
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
      // 送信中も「まだ届いていない」ので確認は出る。返事（成功）が戻って、預かりが空になるまで待つ。
      await waitFor(() => expect(result.current.statusByMatchId['m']?.unsentScores).toEqual([]));

      expect(dispatchBeforeUnload()).toBe(false);
    });

    test('送れていない点があるまま画面（フック）が外れても、確認は出る（アプリごと閉じる・更新する保険）', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      vi.useFakeTimers();
      const { result, unmount } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      unmount();

      expect(dispatchBeforeUnload()).toBe(true);
    });

    test('離れている間に送れて、未送信が無くなったら確認は出なくなる', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
      const { result, unmount } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      unmount();
      await vi.advanceTimersByTimeAsync(1000);

      expect(dispatchBeforeUnload()).toBe(false);
    });

    test('後片付け（dispose）で、待っている送り直しと確認の仕掛けが残らない', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockRejectedValue(new Error('network down'));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      appScoreSyncStore.dispose();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(dispatchBeforeUnload()).toBe(false);
    });

    test('何も操作していなければ確認は出ない', () => {
      renderHook(() => useScoreSync());
      expect(dispatchBeforeUnload()).toBe(false);
    });
  });
});
