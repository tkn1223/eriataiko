import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
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

    test('画面を何度出入りしても、送り直しは 1 本だけ・確認（beforeunload）の仕掛けも 1 つだけ', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockRejectedValueOnce(new Error('network down'))
        .mockImplementation(() => new Promise(() => {}));
      const addListenerSpy = vi.spyOn(window, 'addEventListener');
      const first = renderHook(() => useScoreSync());

      act(() => {
        first.result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      first.unmount();
      for (let visit = 0; visit < 5; visit += 1) {
        renderHook(() => useScoreSync()).unmount();
      }
      await vi.advanceTimersByTimeAsync(1000);

      // 1 回目の送信と、1 秒後の送り直し 1 本だけ（出入りのたびに増えない）
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const beforeUnloadAdds = addListenerSpy.mock.calls.filter(
        ([type]) => type === 'beforeunload'
      );
      expect(beforeUnloadAdds).toHaveLength(1);
      addListenerSpy.mockRestore();
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
        finishing: false,
        finishRetrying: false,
        finishRejectedMessage: null,
        started: true,
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
        finishing: false,
        finishRetrying: false,
        finishRejectedMessage: null,
        started: true,
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

  // 呼出待ちから始めた試合を、別の画面から戻ったときも LIVE の見た目に保つための印
  // （仕様「0 対 0 に戻しても LIVE のまま」）。
  describe('一度でも点を押したか（started）', () => {
    test('まだ 0 対 0 しか送っていなければ started は false', () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 0, sideBScore: 0 });
      });

      expect(result.current.statusByMatchId['m']?.started).toBe(false);
    });

    test('1 点押したあと 0 対 0 に戻しても、started は true のまま', () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 0, sideBScore: 0 });
      });

      expect(result.current.statusByMatchId['m']?.started).toBe(true);
    });

    test('別のゲームで点を押していれば、その試合は started', () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 2, sideAScore: 1, sideBScore: 0 });
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 0, sideBScore: 0 });
        result.current.sync({ matchId: 'other', gameNumber: 1, sideAScore: 0, sideBScore: 0 });
      });

      expect(result.current.statusByMatchId['m']?.started).toBe(true);
      expect(result.current.statusByMatchId['other']?.started).toBe(false);
    });
  });

  // 預かり場所はサーバーのプロセスでは全員で 1 つになる。サーバー側の描画に中身が混ざると、
  // ある人の未送信の点が別の人の画面（HTML）に出てしまう。
  describe('サーバー側の描画には、預かっている点を混ぜない', () => {
    function StatusProbe() {
      const { statusByMatchId } = useScoreSync();
      return <output>{JSON.stringify(statusByMatchId)}</output>;
    }

    test('預かり場所に点があっても、サーバー側の描画（renderToString）では空のまま', () => {
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      appScoreSyncStore.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });
      expect(appScoreSyncStore.getSnapshot()['m']).toBeDefined();

      const html = renderToString(<StatusProbe />);

      expect(html).toBe('<output>{}</output>');
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

  /**
   * 試合の終了（`POST /api/matches/[matchId]/result`）も、点と同じ預かり場所を通して送る。
   * 仕様 2026-10-09: 送れていない点があるときに「試合を終了する」を押したら、予約して、
   * 点を送り終えてから終了を送る。押したら「終了を送っています」と出る。
   */
  describe('試合の終了', () => {
    type Handler = () => Promise<Response>;

    /** URL の末尾で行き先（点の保存 / 終了）を見分けて、それぞれの返事を決める。 */
    function routeFetch(handlers: { scores?: Handler; result?: Handler }) {
      vi.mocked(fetch).mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith('/scores'))
          return (handlers.scores ?? (async () => jsonResponse(200, { ok: true })))();
        if (url.endsWith('/result'))
          return (handlers.result ?? (async () => jsonResponse(200, { ok: true })))();
        throw new Error(`想定外の宛先: ${url}`);
      });
    }

    function calledUrls() {
      return vi.mocked(fetch).mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);
    }

    test('点がすべて届いていれば、すぐ POST /result を送る（本文なし）', async () => {
      routeFetch({});
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));

      await waitFor(() => expect(calledUrls()).toEqual(['POST /api/matches/m/result']));
    });

    test('押した直後から、成功するまで「終了を送っています」の印（finishing）が付く', async () => {
      let resolveResult!: (response: Response) => void;
      routeFetch({ result: () => new Promise((resolve) => (resolveResult = resolve)) });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      expect(result.current.statusByMatchId['m']?.finishing).toBe(true);

      await act(async () => resolveResult(jsonResponse(200, { ok: true })));

      expect(result.current.statusByMatchId['m']?.finishing ?? false).toBe(false);
    });

    test('送れていない点があるときは、点が届くまで終了を送らない。届いたあとに送る', async () => {
      vi.useFakeTimers();
      let scoreAttempt = 0;
      routeFetch({
        scores: async () => {
          scoreAttempt += 1;
          if (scoreAttempt === 1) throw new Error('network down');
          return jsonResponse(200, { ok: true });
        },
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => result.current.finish('m'));
      await act(async () => {
        await Promise.resolve();
      });

      // 点がまだ届いていない。終了は送っていないが、「終了を送っています」は出ている
      expect(calledUrls()).toEqual(['POST /api/matches/m/scores']);
      expect(result.current.statusByMatchId['m']?.finishing).toBe(true);

      // 点の送り直しが成功した直後に、終了を送る
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(calledUrls()).toEqual([
        'POST /api/matches/m/scores',
        'POST /api/matches/m/scores',
        'POST /api/matches/m/result',
      ]);
    });

    test('点を送っている最中に終了を押しても、その返事のあとで終了を送る', async () => {
      let resolveScore!: (response: Response) => void;
      routeFetch({ scores: () => new Promise((resolve) => (resolveScore = resolve)) });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 0 });
        result.current.finish('m');
      });
      expect(calledUrls()).toEqual(['POST /api/matches/m/scores']);

      await act(async () => resolveScore(jsonResponse(200, { ok: true })));

      await waitFor(() =>
        expect(calledUrls()).toEqual(['POST /api/matches/m/scores', 'POST /api/matches/m/result'])
      );
    });

    test('別の試合の送れていない点は、終了を待たせない', async () => {
      routeFetch({ scores: () => new Promise(() => {}) });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'other', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
        result.current.finish('m');
      });

      await waitFor(() => expect(calledUrls()).toContain('POST /api/matches/m/result'));
    });

    test('終了が成功したら、終了を待っていた画面に知らせる（印も消える）', async () => {
      routeFetch({});
      const finished: string[] = [];
      const unsubscribe = appScoreSyncStore.subscribeFinished((matchId) => finished.push(matchId));
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));

      await waitFor(() => expect(finished).toEqual(['m']));
      unsubscribe();
    });

    test('つながらない・5xx は、間隔を空けて終了を送り直す。その間も「終了を送っています」', async () => {
      vi.useFakeTimers();
      let attempt = 0;
      routeFetch({
        result: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error('network down');
          if (attempt === 2)
            return jsonResponse(500, { error: 'サーバー側でエラーが起きました。' });
          return jsonResponse(200, { ok: true });
        },
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.statusByMatchId['m']).toMatchObject({
        finishing: true,
        finishRetrying: true,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(attempt).toBe(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(attempt).toBe(3);
      expect(result.current.statusByMatchId['m']?.finishing ?? false).toBe(false);
    });

    test('4xx は送り直さず、入口が返した日本語の理由を出す。「終了を送っています」は消える', async () => {
      vi.useFakeTimers();
      routeFetch({
        result: async () =>
          jsonResponse(400, { error: '同点では終了できません。どちらかの点を入れてください。' }),
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.statusByMatchId['m']).toMatchObject({
        finishing: false,
        finishRejectedMessage: '同点では終了できません。どちらかの点を入れてください。',
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(calledUrls()).toEqual(['POST /api/matches/m/result']);
    });

    test('断られたあと、もう一度押せば、また送る', async () => {
      let attempt = 0;
      routeFetch({
        result: async () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(400, { error: '断りました' })
            : jsonResponse(200, { ok: true });
        },
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      await waitFor(() =>
        expect(result.current.statusByMatchId['m']?.finishRejectedMessage).toBe('断りました')
      );

      act(() => result.current.finish('m'));

      await waitFor(() => expect(attempt).toBe(2));
      await waitFor(() =>
        expect(result.current.statusByMatchId['m']?.finishRejectedMessage ?? null).toBeNull()
      );
    });

    test('点が入口に断られている（4xx）ときは、終了を送らず、その理由を出す', async () => {
      vi.useFakeTimers();
      routeFetch({
        scores: async () => jsonResponse(409, { error: '終了した試合です。' }),
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 0 });
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => result.current.finish('m'));

      expect(calledUrls()).toEqual(['POST /api/matches/m/scores']);
      expect(result.current.statusByMatchId['m']).toMatchObject({
        rejectedMessage: '終了した試合です。',
        finishing: false,
        finishRejectedMessage: '点が保存できていないため、試合の終了は送っていません。',
      });
    });

    test('終了を待っている間に二重に押しても、送るのは 1 本だけ', async () => {
      routeFetch({ result: () => new Promise(() => {}) });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.finish('m');
        result.current.finish('m');
        result.current.finish('m');
      });

      expect(calledUrls()).toEqual(['POST /api/matches/m/result']);
    });

    test('終了を送っている間、ブラウザを閉じようとすると確認が出る', async () => {
      routeFetch({ result: () => new Promise(() => {}) });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    test('画面を離れても、終了の送り直しは続く', async () => {
      vi.useFakeTimers();
      let attempt = 0;
      routeFetch({
        result: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error('network down');
          return jsonResponse(200, { ok: true });
        },
      });
      const { result, unmount } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      await act(async () => {
        await Promise.resolve();
      });
      unmount();
      await vi.advanceTimersByTimeAsync(1000);

      expect(attempt).toBe(2);
    });

    test('後片付け（dispose）で、待っている終了の送り直しは残らない', async () => {
      vi.useFakeTimers();
      routeFetch({
        result: async () => {
          throw new Error('network down');
        },
      });
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m'));
      await act(async () => {
        await Promise.resolve();
      });
      appScoreSyncStore.dispose();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(calledUrls()).toEqual(['POST /api/matches/m/result']);
    });
  });
});
