import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { appScoreSyncStore, ECHO_WAIT_MS, useScoreSync } from '@/ui/courts/use-score-sync';

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

      expect(second.result.current.statusByMatchId['m']?.pendingScores).toEqual([
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
        scorerOp: null,
        scorerOpMessage: null,
        scorerRejection: null,
        started: true,
        pendingScores: [{ gameNumber: 1, sideAScore: 3, sideBScore: 1 }],
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
      // 購読での戻りを待ちきるまでたつ（戻り待ちは下の describe で確かめる）
      await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

      const returned = renderHook(() => useScoreSync());

      expect(returned.result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
      expect(returned.result.current.statusByMatchId['m']?.pendingScores).toEqual([]);
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
      // 購読で戻ってきた
      act(() => {
        appScoreSyncStore.noteRemoteScore({
          matchId: 'm',
          gameNumber: 1,
          sideAScore: 3,
          sideBScore: 1,
        });
      });

      const returned = renderHook(() => useScoreSync());
      expect(returned.result.current.statusByMatchId['m']?.pendingScores).toEqual([]);
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

    // 断られた点はもう送らないので「未送信」に数えない。数えると、戻ったときにサーバーの正しい点より
    // 断られた古い点が優先して出て、閉じるたびの確認も一日中出続ける。理由だけは残してコートに出す。
    test('入口に断られた点は、離れて戻ると理由だけ受け取り、未送信の数字には入らない', async () => {
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
        scorerOp: null,
        scorerOpMessage: null,
        scorerRejection: null,
        started: true,
        pendingScores: [],
      });
    });

    test('手元の数字は、送信中も、送れて購読で戻ってくるまでも残り、戻ってきたら無くなる', async () => {
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
      expect(result.current.statusByMatchId['m']?.pendingScores).toHaveLength(1);

      await act(async () => {
        resolveFirst(jsonResponse(200, { ok: true }));
      });
      expect(result.current.statusByMatchId['m']?.pendingScores).toHaveLength(1);

      act(() => {
        appScoreSyncStore.noteRemoteScore({
          matchId: 'm',
          gameNumber: 1,
          sideAScore: 3,
          sideBScore: 1,
        });
      });
      expect(result.current.statusByMatchId['m']?.pendingScores).toEqual([]);
    });
  });

  /**
   * 送れた点が購読（Realtime）で戻ってくるまでは、手元の値を優先する（戻り待ち）。
   * 購読の知らせは書いた順に届くが、保存の返事より遅れることがある。自分の 1 つ前の値の知らせで
   * 数字が戻らないようにする（use-score-sync.ts の先頭の説明）。
   */
  describe('戻り待ち（送れた点が購読で戻ってくるまで）', () => {
    const KEY = { matchId: 'm', gameNumber: 1 };

    function pendingOf(result: { current: ReturnType<typeof useScoreSync> }) {
      return result.current.statusByMatchId['m']?.pendingScores ?? [];
    }

    function echo(sideAScore: number, sideBScore: number) {
      act(() => appScoreSyncStore.noteRemoteScore({ ...KEY, sideAScore, sideBScore }));
    }

    async function sendAndSave(
      result: { current: ReturnType<typeof useScoreSync> },
      sideAScore: number
    ) {
      act(() => result.current.sync({ ...KEY, sideAScore, sideBScore: 0 }));
      await act(async () => {});
    }

    test('5 → 6 と送れたあと、5 の知らせが遅れて届いても、手元の 6 を優先したまま。6 が戻ったら優先をやめる', async () => {
      vi.mocked(fetch).mockImplementation(async () => jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());
      await sendAndSave(result, 5);
      await sendAndSave(result, 6);

      echo(5, 0);
      expect(pendingOf(result)).toEqual([{ gameNumber: 1, sideAScore: 6, sideBScore: 0 }]);

      echo(6, 0);
      expect(pendingOf(result)).toEqual([]);
    });

    test('自分の最後の値が戻る前に届いた別の値（それより前に書かれた他の人の点）では、優先をやめない', async () => {
      vi.mocked(fetch).mockImplementation(async () => jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());
      await sendAndSave(result, 5);

      echo(4, 2);

      expect(pendingOf(result)).toEqual([{ gameNumber: 1, sideAScore: 5, sideBScore: 0 }]);
    });

    test('戻ってこないまま待ちきったら、優先をやめる（接続が途切れていた・まだ購読していなかった）', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockImplementation(async () => jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());
      await sendAndSave(result, 5);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS - 1);
      });
      expect(pendingOf(result)).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(pendingOf(result)).toEqual([]);
    });

    test('送れなかった値は待たない（送り直して届いた 1 回ぶんの戻りで、優先をやめる）', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());
      await sendAndSave(result, 5); // つながらない
      await sendAndSave(result, 5); // 押し直して、同じ値が届く

      echo(5, 0);

      expect(pendingOf(result)).toEqual([]);
    });

    test('つながったとき（forgetAwaitingEchoes）は、それより前に送れた値を待つのをやめる。送信中の値は待ち続ける', async () => {
      let resolveSecond!: (response: Response) => void;
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecond = resolve;
            })
        );
      const { result } = renderHook(() => useScoreSync());
      await sendAndSave(result, 5);
      act(() => appScoreSyncStore.forgetAwaitingEchoes());
      expect(pendingOf(result)).toEqual([]);

      act(() => result.current.sync({ ...KEY, sideAScore: 6, sideBScore: 0 })); // 送信中
      act(() => appScoreSyncStore.forgetAwaitingEchoes());
      await act(async () => {
        resolveSecond(jsonResponse(200, { ok: true }));
      });
      // 6 は送信中だったので、届いたあとも戻りを待っている
      expect(pendingOf(result)).toEqual([{ gameNumber: 1, sideAScore: 6, sideBScore: 0 }]);

      echo(6, 0);
      expect(pendingOf(result)).toEqual([]);
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

    test('入口に断られた点だけが残っているときは、確認は出ない（もう送らないため）', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(jsonResponse(404, { error: '見つかりません。' }));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      await waitFor(() =>
        expect(result.current.statusByMatchId['m']?.rejectedMessage).toBeTruthy()
      );

      expect(dispatchBeforeUnload()).toBe(false);
    });

    test('保存できていれば確認は出ない', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      });
      // 送信中も「まだ届いていない」ので確認は出る。返事（成功）が戻るまで待つ。
      // 購読での戻りを待っている間は、もう届いているので確認は出さない。
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await act(async () => {});

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

    test('棄権の側を付けて finish すると、本文 { retiredSide } つきで POST する。付けなければ本文なし', async () => {
      routeFetch({});
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m', 'B'));
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      const [, init] = vi.mocked(fetch).mock.calls[0];
      expect(JSON.parse(init?.body as string)).toEqual({ retiredSide: 'B' });

      act(() => result.current.finish('n'));
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2));
      expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBeUndefined();
    });

    test('棄権つきの終了は、送れていない点が届いてから送る（棄権の側も忘れない）', async () => {
      let resolveScore!: (response: Response) => void;
      routeFetch({ scores: () => new Promise((resolve) => (resolveScore = resolve)) });
      const { result } = renderHook(() => useScoreSync());

      act(() => {
        result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 0 });
        result.current.finish('m', 'A');
      });
      expect(calledUrls()).toEqual(['POST /api/matches/m/scores']);
      expect(result.current.statusByMatchId['m']?.finishRetiredSide).toBe('A');

      await act(async () => resolveScore(jsonResponse(200, { ok: true })));

      await waitFor(() =>
        expect(calledUrls()).toEqual(['POST /api/matches/m/scores', 'POST /api/matches/m/result'])
      );
      const [, init] = vi.mocked(fetch).mock.calls[1];
      expect(JSON.parse(init?.body as string)).toEqual({ retiredSide: 'A' });
    });

    test('終了が成功したときの知らせに、棄権の側も付く', async () => {
      routeFetch({});
      const finished: Array<[string, 'A' | 'B' | null]> = [];
      const unsubscribe = appScoreSyncStore.subscribeFinished((matchId, retiredSide) =>
        finished.push([matchId, retiredSide])
      );
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m', 'A'));

      await waitFor(() => expect(finished).toEqual([['m', 'A']]));
      unsubscribe();
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

  describe('入口に断られた点の後始末', () => {
    test('点が断られたら、その試合の id で知らせる（画面が読み直してサーバーの点に戻すため）', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { error: '終了した試合です。' }));
      const rejected: string[] = [];
      const unsubscribe = appScoreSyncStore.subscribeScoreRejected((matchId) =>
        rejected.push(matchId)
      );

      act(() =>
        appScoreSyncStore.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 })
      );

      await waitFor(() => expect(rejected).toEqual(['m']));
      unsubscribe();
    });

    test('forgetRejected で断られた印が消え、そのあとの終了は止められずに送られる', async () => {
      let scoresRejected = true;
      vi.mocked(fetch).mockImplementation(async (input) =>
        String(input).endsWith('/scores') && scoresRejected
          ? jsonResponse(409, { error: '終了した試合です。' })
          : jsonResponse(200, { ok: true })
      );
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 }));
      await waitFor(() =>
        expect(result.current.statusByMatchId['m']?.rejectedMessage).toBe('終了した試合です。')
      );

      // 試合が取り消されて進行中に戻った
      scoresRejected = false;
      act(() => appScoreSyncStore.forgetRejected('m'));
      expect(result.current.statusByMatchId['m']).toBeUndefined();

      act(() => result.current.finish('m'));
      await waitFor(() =>
        expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
          '/api/matches/m/result'
        )
      );
    });
  });

  // 試合の状態（終了・取り消し）にも、点と同じ戻り待ちがある。自分が送った状態が購読で戻ってくるまで、
  // それより古い知らせを画面に当てない（docs/specs/2026-10-14-courts-stale-result.md）。
  describe('試合の状態の戻り待ち（終了・取り消しが購読で戻ってくるまで）', () => {
    const DONE = 'done';
    const LIVE = 'live';

    /** 購読で届いた試合の変化を知らせて、「このまま当ててよいか」を受け取る。 */
    function shouldApply(status: 'done' | 'live' | 'waiting', matchId = 'm') {
      return appScoreSyncStore.noteRemoteMatch({ matchId, status });
    }

    /** 送って、受け付けられたところまで進める。 */
    function sendAndAccept(status: 'done' | 'live', matchId = 'm') {
      appScoreSyncStore.expectMatchEcho(matchId, status).accepted();
    }

    test('終了 → 取り消し と受け付けられたあと、古い「終了」の知らせは当てない。「取り消し」が戻ったら当てる', () => {
      sendAndAccept(DONE);
      sendAndAccept(LIVE);

      expect(shouldApply(DONE)).toBe(false);
      expect(shouldApply(LIVE)).toBe(true);
    });

    test('自分の送った状態が戻ったあとは、どの知らせも当てる（待ちは残らない）', () => {
      sendAndAccept(DONE);
      expect(shouldApply(DONE)).toBe(true);

      expect(shouldApply(LIVE)).toBe(true);
      expect(shouldApply(DONE)).toBe(true);
    });

    test('自分の最後の状態が戻る前に届いた別の状態（それより前に書かれた古い知らせ）は、当てない', () => {
      sendAndAccept(DONE);

      expect(shouldApply(LIVE)).toBe(false);
      // 自分の状態が戻れば、待ちは終わる
      expect(shouldApply(DONE)).toBe(true);
      expect(shouldApply(LIVE)).toBe(true);
    });

    test('送っている最中に、ほかの人の同じ状態の知らせが先に届いたら、その中身を当てる（終わり方は見ない）', () => {
      appScoreSyncStore.expectMatchEcho('m', DONE); // 棄権つきの終了を送っている最中

      // ほかの人が、棄権なしで先に終了していた。記録どおりの中身を画面に当てる
      expect(appScoreSyncStore.noteRemoteMatch({ matchId: 'm', status: 'done' })).toBe(true);
    });

    test('自分が何も送っていない試合は、いつでも当てる。別の試合の待ちは影響しない', () => {
      sendAndAccept(DONE, 'other');

      expect(shouldApply(LIVE, 'm')).toBe(true);
      expect(shouldApply(LIVE, 'other')).toBe(false);
    });

    test('返事より先に知らせが届いたら、そこで待ちは終わる（返事が来たあとに待ち続けない）', () => {
      const ticket = appScoreSyncStore.expectMatchEcho('m', LIVE);

      expect(shouldApply(LIVE)).toBe(true);
      ticket.accepted();

      expect(shouldApply(DONE)).toBe(true);
    });

    test('送れなかった状態は待たない', () => {
      appScoreSyncStore.expectMatchEcho('m', DONE).failed();

      expect(shouldApply(LIVE)).toBe(true);
    });

    test('戻ってこないまま待ちきったら（10 秒）、待つのをやめる', async () => {
      vi.useFakeTimers();
      sendAndAccept(DONE);

      await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS - 1);
      expect(shouldApply(LIVE)).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(shouldApply(LIVE)).toBe(true);
    });

    // 当てなかった知らせは、自分の状態が戻れば「それより古い」と分かる。戻らないまま待ちが
    // 終わると、本物の変化（ほかの人の終了・取り消し）だったかもしれないので、読み直して確かめる
    describe('戻らないまま待ちが終わったときの読み直し', () => {
      function listenGaveUp() {
        const gaveUp = vi.fn();
        const unsubscribe = appScoreSyncStore.subscribeMatchEchoGaveUp(gaveUp);
        return { gaveUp, unsubscribe };
      }

      test('戻ってこないまま待ちきったとき、待っている間に当てなかった知らせがあれば、読み直しを頼む（1 回）', async () => {
        vi.useFakeTimers();
        const { gaveUp } = listenGaveUp();
        sendAndAccept(DONE);
        expect(shouldApply(LIVE)).toBe(false);
        expect(shouldApply(LIVE)).toBe(false);

        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

        expect(gaveUp).toHaveBeenCalledTimes(1);
        expect(gaveUp).toHaveBeenCalledWith('m');
      });

      test('待ちきっても、当てなかった知らせが無ければ読み直しは頼まない', async () => {
        vi.useFakeTimers();
        const { gaveUp } = listenGaveUp();
        sendAndAccept(DONE);

        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

        expect(gaveUp).not.toHaveBeenCalled();
      });

      test('自分の状態が戻って待ちが終わったときは、当てなかった知らせがあっても読み直しは頼まない', async () => {
        vi.useFakeTimers();
        const { gaveUp } = listenGaveUp();
        sendAndAccept(DONE);
        expect(shouldApply(LIVE)).toBe(false);
        expect(shouldApply(DONE)).toBe(true);

        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

        expect(gaveUp).not.toHaveBeenCalled();
      });

      test('送れなかったとき、送っている間に当てなかった知らせがあれば、読み直しを頼む', () => {
        const { gaveUp } = listenGaveUp();
        const ticket = appScoreSyncStore.expectMatchEcho('m', LIVE);
        expect(shouldApply(DONE)).toBe(false);

        ticket.failed();

        expect(gaveUp).toHaveBeenCalledWith('m');
      });

      test('つながり直したとき（読み直しはそちらで頼む）は、ここでは頼まない', async () => {
        vi.useFakeTimers();
        const { gaveUp } = listenGaveUp();
        sendAndAccept(DONE);
        expect(shouldApply(LIVE)).toBe(false);

        appScoreSyncStore.forgetAwaitingEchoes();
        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

        expect(gaveUp).not.toHaveBeenCalled();
      });

      test('受け取りをやめたら呼ばれない', async () => {
        vi.useFakeTimers();
        const { gaveUp, unsubscribe } = listenGaveUp();
        unsubscribe();
        sendAndAccept(DONE);
        expect(shouldApply(LIVE)).toBe(false);

        await vi.advanceTimersByTimeAsync(ECHO_WAIT_MS);

        expect(gaveUp).not.toHaveBeenCalled();
      });
    });

    test('つながったとき（forgetAwaitingEchoes）は待つのをやめる。送っている最中の状態は待ち続ける', () => {
      sendAndAccept(DONE);
      appScoreSyncStore.expectMatchEcho('m', LIVE); // まだ返事が来ていない
      appScoreSyncStore.forgetAwaitingEchoes();

      // 受け付け済みの DONE の知らせは、もう待たない。送っている最中の LIVE は戻りを待つ
      expect(shouldApply(DONE)).toBe(false);
      expect(shouldApply(LIVE)).toBe(true);
    });

    test('試合の終了は、受け付けられたあと、その終了の知らせが戻るまで古い状態を当てない', async () => {
      vi.mocked(fetch).mockImplementation(async () => jsonResponse(200, { ok: true }));
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m', 'A'));
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      await act(async () => {});

      expect(shouldApply(LIVE)).toBe(false);
      expect(shouldApply(DONE)).toBe(true);
    });

    test('終了が断られたときは、待たない', async () => {
      vi.mocked(fetch).mockImplementation(async () =>
        jsonResponse(409, { error: '終了した試合です。' })
      );
      const { result } = renderHook(() => useScoreSync());

      act(() => result.current.finish('m', 'A'));
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      await act(async () => {});

      expect(shouldApply(LIVE)).toBe(true);
    });
  });
});

/**
 * 得点入力の担当（docs/specs/2026-10-14-match-scorer.md）。
 * 担当を取る・やめる操作は、点と同じ預かり場所を通す（電波が細くて失敗しても入力は止めず、裏で送り直す）。
 */
describe('担当でないと断られた点（⑧）', () => {
  const NOT_SCORER = {
    error: '愛知北のじろうさんが担当しています。',
    code: 'not-scorer',
  };

  test('断られると、理由と送れなかった点が知らせとして残る。ふつうの「保存できませんでした」の理由とは別', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection).toEqual({
        message: '愛知北のじろうさんが担当しています。',
        games: [{ gameNumber: 1, sideAScore: 12, sideBScore: 10 }],
      })
    );
    expect(result.current.statusByMatchId['m']?.rejectedMessage).toBeNull();
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
  });

  test('送り直さない（送り直しても、いまの担当の点を上書きしようとするだけ）', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('いくつかのゲームの点が断られたら、全部ゲーム番号順に並ぶ', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 2, sideAScore: 3, sideBScore: 5 });
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 21, sideBScore: 15 });
    });

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection?.games).toEqual([
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 3, sideBScore: 5 },
      ])
    );
  });

  test('断られた点は「手元の点」として残らない（サーバーのいまの担当の点を優先して出すため）', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection).not.toBeNull()
    );
    expect(result.current.statusByMatchId['m']?.pendingScores).toEqual([]);
  });

  test('断られた点があっても、閉じる・更新しようとしたときの確認は出ない（もう送らない点なので）', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));
    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection).not.toBeNull()
    );

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('断られた理由を試合の id ごとに通知する（画面が読み直して、サーバーの点に戻すため）', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const rejected: string[] = [];
    const unsubscribe = appScoreSyncStore.subscribeScoreRejected((matchId) =>
      rejected.push(matchId)
    );

    act(() =>
      appScoreSyncStore.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 })
    );

    await waitFor(() => expect(rejected).toEqual(['m']));
    unsubscribe();
  });

  test('「閉じる」で知らせが消える。ほかの試合の知らせは残る', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => {
      result.current.sync({ matchId: 'm1', gameNumber: 1, sideAScore: 12, sideBScore: 10 });
      result.current.sync({ matchId: 'm2', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
    });
    await waitFor(() =>
      expect(result.current.statusByMatchId['m2']?.scorerRejection).not.toBeNull()
    );
    await waitFor(() =>
      expect(result.current.statusByMatchId['m1']?.scorerRejection).not.toBeNull()
    );

    act(() => appScoreSyncStore.dismissScorerRejection('m1'));

    expect(result.current.statusByMatchId['m1']).toBeUndefined();
    expect(result.current.statusByMatchId['m2']?.scorerRejection).not.toBeNull();
  });

  test('もう一度点を押せば、知らせは消えて、新しい値を改めて送る（引き継いだあとなど）', async () => {
    let scorer = false;
    vi.mocked(fetch).mockImplementation(async () =>
      scorer ? jsonResponse(200, { ok: true }) : jsonResponse(409, NOT_SCORER)
    );
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));
    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection).not.toBeNull()
    );

    scorer = true;
    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 13, sideBScore: 10 }));

    expect(result.current.statusByMatchId['m']?.scorerRejection).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  test('code の無い 409（終了した試合など）は、今までどおり rejectedMessage に出て、知らせにはならない', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(409, { error: '終了した試合です。' })
    );
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 }));

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.rejectedMessage).toBe('終了した試合です。')
    );
    expect(result.current.statusByMatchId['m']?.scorerRejection).toBeNull();
  });

  test('点が断られたまま「試合を終了する」を押すと、終了は送らず、理由を出す', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(409, NOT_SCORER));
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 12, sideBScore: 10 }));
    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerRejection).not.toBeNull()
    );

    act(() => result.current.finish('m'));

    expect(result.current.statusByMatchId['m']?.finishRejectedMessage).toContain(
      '点が保存できていない'
    );
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      '/api/matches/m/result'
    );
  });

  test('終了が担当でないと断られたら、その理由が終了の案内に出る', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(409, {
        error: '愛知北のじろうさんが担当しています。終了するには、先に引き継いでください。',
        code: 'not-scorer',
      })
    );
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.finish('m'));

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.finishRejectedMessage).toBe(
        '愛知北のじろうさんが担当しています。終了するには、先に引き継いでください。'
      )
    );
  });
});

describe('担当を取る・やめる', () => {
  test('担当を取ると POST /scorer を送る。引き継がないときは本文なし', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, outcome: 'claimed' }));

    act(() => appScoreSyncStore.claimScorer('m', false));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/matches/m/scorer');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
  });

  test('引き継ぐときは本文で takeOver: true を送る', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, outcome: 'took-over' }));

    act(() => appScoreSyncStore.claimScorer('m', true));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({
      takeOver: true,
    });
  });

  test('送っている間は「取る操作の途中」が見え、受け付けられると消えて、受け付けられたと知らせる', async () => {
    let resolveClaim!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveClaim = resolve;
        })
    );
    const events: unknown[] = [];
    const unsubscribe = appScoreSyncStore.subscribeScorerOp((event) => events.push(event));
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    expect(result.current.statusByMatchId['m']?.scorerOp).toEqual({
      kind: 'claim',
      retrying: false,
    });

    await act(async () => {
      resolveClaim(jsonResponse(200, { ok: true }));
    });

    expect(result.current.statusByMatchId['m']?.scorerOp ?? null).toBeNull();
    expect(events).toEqual([{ matchId: 'm', kind: 'claim', result: 'accepted' }]);
    unsubscribe();
  });

  test('つながらないときは送り直し、その間も「取る操作の途中」が見える。つながれば受け付けられる', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.statusByMatchId['m']?.scorerOp).toEqual({
      kind: 'claim',
      retrying: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.statusByMatchId['m']?.scorerOp ?? null).toBeNull();
  });

  test('担当を取る操作が失敗していても、点は押せて、そのまま送られる（⑤）', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith('/scorer')) throw new Error('network down');
      return jsonResponse(200, { ok: true });
    });
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 }));
    await act(async () => {
      await Promise.resolve();
    });

    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls).toContain('/api/matches/m/scores');
    // 点は保存できているので「保存できていません」は出ない。取る操作の送り直しだけが続く
    expect(result.current.statusByMatchId['m']?.retryingMessage).toBeNull();
    expect(result.current.statusByMatchId['m']?.scorerOp?.retrying).toBe(true);
  });

  test('ほかの人が入力中で断られたら、送り直さず、理由は出さない（担当の表示が理由を語るため）。断られたと知らせる', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(409, { error: '愛知北のじろうさんが入力しています。', code: 'scorer-active' })
    );
    const events: unknown[] = [];
    appScoreSyncStore.subscribeScorerOp((event) => events.push(event));
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.statusByMatchId['m']?.scorerOp ?? null).toBeNull();
    expect(result.current.statusByMatchId['m']?.scorerOpMessage ?? null).toBeNull();
    expect(events).toEqual([{ matchId: 'm', kind: 'claim', result: 'rejected' }]);
  });

  test('参加者でないなど、理由の印が無い断られ方は、日本語の理由を出す', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse(403, { error: 'この大会の参加者として登録されていません。' })
    );
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));

    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerOpMessage).toBe(
        'この大会の参加者として登録されていません。'
      )
    );
    expect(result.current.statusByMatchId['m']?.scorerOp ?? null).toBeNull();
  });

  test('次の操作を始めると、前の断られた理由は消える', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(403, { error: '参加者ではありません。' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    await waitFor(() =>
      expect(result.current.statusByMatchId['m']?.scorerOpMessage).toBe('参加者ではありません。')
    );

    act(() => appScoreSyncStore.claimScorer('m', false));

    expect(result.current.statusByMatchId['m']?.scorerOpMessage ?? null).toBeNull();
  });

  test('担当をやめると DELETE /scorer を送る', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { ok: true, outcome: 'released' }));

    act(() => appScoreSyncStore.releaseScorer('m'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/matches/m/scorer');
    expect(init?.method).toBe('DELETE');
  });

  test('送れていない点があるうちは、やめる操作は送らない（やめたあとに点が届くと、また担当になってしまうため）', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/scores') && fetchMock.mock.calls.length === 1
        ? Promise.reject(new Error('network down'))
        : jsonResponse(200, { ok: true })
    );
    const { result } = renderHook(() => useScoreSync());

    act(() => result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => appScoreSyncStore.releaseScorer('m'));
    await act(async () => {
      await Promise.resolve();
    });

    // 点が送れていない間は、やめる操作を送っていない。でも画面ではやめた扱い
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/matches/m/scores']);
    expect(result.current.statusByMatchId['m']?.scorerOp).toEqual({
      kind: 'release',
      retrying: false,
    });

    // 点が届いたら、そのあとにやめる操作を送る
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/matches/m/scores',
      '/api/matches/m/scores',
      '/api/matches/m/scorer',
    ]);
  });

  test('点が断られたときも、待たせていたやめる操作は送る（待ち続けない）', async () => {
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith('/scores')
        ? jsonResponse(409, { error: '愛知北のじろうさんが担当しています。', code: 'not-scorer' })
        : jsonResponse(200, { ok: true })
    );
    const { result } = renderHook(() => useScoreSync());
    // 点の返事が来る前に、やめる操作を頼む
    act(() => {
      result.current.sync({ matchId: 'm', gameNumber: 1, sideAScore: 1, sideBScore: 0 });
      result.current.releaseScorer('m');
    });

    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
        '/api/matches/m/scorer'
      )
    );
  });

  test('取る操作のあとにやめる操作を頼むと、やめる操作だけが残る（最後の頼みが勝つ）', async () => {
    let resolveClaim!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveClaim = resolve;
          })
      )
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const events: unknown[] = [];
    appScoreSyncStore.subscribeScorerOp((event) => events.push(event));
    const { result } = renderHook(() => useScoreSync());

    act(() => appScoreSyncStore.claimScorer('m', false));
    act(() => appScoreSyncStore.releaseScorer('m'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    // 古い取る操作の返事が今ごろ来ても、やめる操作の状態を壊さない
    await act(async () => {
      resolveClaim(jsonResponse(200, { ok: true }));
    });

    expect(events).toEqual([{ matchId: 'm', kind: 'release', result: 'accepted' }]);
    expect(result.current.statusByMatchId['m']?.scorerOp ?? null).toBeNull();
  });
});
