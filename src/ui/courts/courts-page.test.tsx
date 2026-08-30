import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { GameScoreChange } from '@/ui/courts/use-live-scores';

// router.refresh() を差し替えて、失敗時に呼ばれたかを確かめられるようにする
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }));

// Realtime の購読は本物の Supabase を必要とするので、courts-page のテストでは差し替える。
// onGameScoreChange を外へ捕まえておき、テストから「届いた値」を直接流し込めるようにする。
let capturedOnGameScoreChange: ((change: GameScoreChange) => void) | null = null;
let mockConnectionStatus: 'connected' | 'disconnected' = 'connected';
vi.mock('@/ui/courts/use-live-scores', () => ({
  useLiveScores: ({ onGameScoreChange }: { onGameScoreChange: (c: GameScoreChange) => void }) => {
    capturedOnGameScoreChange = onGameScoreChange;
    return { connectionStatus: mockConnectionStatus };
  },
}));

// これらは vi.mock 後に import する（ホイストされるので import 順は問題ない）
const { CourtsPage } = await import('@/ui/courts/courts-page');
const { sampleCourts } = await import('@/ui/courts/sample-data');

function renderPage(props: Partial<Parameters<typeof CourtsPage>[0]> = {}) {
  return render(
    <CourtsPage courts={sampleCourts} completedMatches={2} totalMatches={48} canEdit {...props} />
  );
}

/** 開発中と同じ StrictMode（React が描き直しや更新関数を 2 回呼ぶ）で描く。 */
function renderPageInStrictMode() {
  return render(
    <CourtsPage courts={sampleCourts} completedMatches={2} totalMatches={48} canEdit />,
    { wrapper: StrictMode }
  );
}

/** 応答を後から自由なタイミングで返せる fetch のモック。 */
function deferredFetch() {
  const calls: { resolve: (res: Response) => void; reject: (err: unknown) => void }[] = [];
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        calls.push({ resolve, reject });
      })
  );
  return { fetchMock, calls };
}

function okResponse(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function errorResponse(message: string) {
  return new Response(JSON.stringify({ error: message }), { status: 500 });
}

beforeEach(() => {
  capturedOnGameScoreChange = null;
  mockConnectionStatus = 'connected';
  refreshMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CourtsPage', () => {
  test('見出し「結果LIVE」が出る', () => {
    renderPage();
    expect(screen.getByText('結果LIVE')).toBeInTheDocument();
  });

  test('「予選リーグ」のラベルと「2/48 試合消化」が出る', () => {
    renderPage();

    expect(screen.getByText('予選リーグ')).toBeInTheDocument();
    expect(screen.getByText('2/48 試合消化')).toBeInTheDocument();
  });

  test('「まだ保存されません」の帯は出ない（保存できるようになったので）', () => {
    renderPage();

    expect(
      screen.queryByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).not.toBeInTheDocument();
  });

  test('コートのカードが8枚出る', () => {
    renderPage();

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      expect(screen.getByTestId(`court-card-${courtNumber}`)).toBeInTheDocument();
    }
  });

  test('観戦者（canEdit=false）には＋−ボタンが出ない', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPage({ canEdit: false });

    expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
  });

  test('「＋」を押すと得点がすぐ1増える（保存の応答を待たない）', async () => {
    const { fetchMock } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');

    // コート1 は佐々木・井上（A）15点 / 田中・木村（B）12点 から始まる
    expect(within(card).getByText('15')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));
    expect(within(card).getByText('16')).toBeInTheDocument();
  });

  test('「＋」を押すと POST /api/matches/{matchId}/scores に今の点数が送られる', async () => {
    const { fetchMock } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/matches/sample-match-1/scores',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ gameNumber: 1, sideAScore: 16, sideBScore: 12 }),
      })
    );
  });

  test('「−」を押すと得点が1減る', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    renderPage();
    const card = screen.getByTestId('court-card-1');

    expect(within(card).getByText('12')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '田中・木村の得点を1減らす' }));
    expect(within(card).getByText('11')).toBeInTheDocument();
  });

  test('「−」を押しても0より下にはならない', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    renderPage();
    const card = screen.getByTestId('court-card-6');

    // コート6 は 長谷川・村上（A）5点 から始まる
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(within(card).getByRole('button', { name: '長谷川・村上の得点を1減らす' }));
    }
    expect(within(card).getByText('0')).toBeInTheDocument();
  });

  test('コートごとに得点の増減が独立している（他のコートに影響しない）', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    renderPage();
    const card1 = screen.getByTestId('court-card-1');
    const card2 = screen.getByTestId('court-card-2');

    fireEvent.click(within(card1).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));

    expect(within(card1).getByText('16')).toBeInTheDocument();
    // コート2 は 山田・中川（A）20点のまま変わらない
    expect(within(card2).getByText('20')).toBeInTheDocument();
  });

  test('保存に失敗すると、日本語のエラーが画面に出て router.refresh() が呼ばれる', async () => {
    const { fetchMock, calls } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));
    expect(within(card).getByText('16')).toBeInTheDocument();

    calls[0].resolve(
      errorResponse('サーバー側でエラーが起きました。少し待ってからやり直してください。')
    );

    await waitFor(() =>
      expect(
        screen.getByText('サーバー側でエラーが起きました。少し待ってからやり直してください。')
      ).toBeInTheDocument()
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  test('連打して先に送った分が失敗しても、あとから成功した新しい値のままになる（巻き戻らない）', async () => {
    const { fetchMock, calls } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');
    const plus = within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' });

    fireEvent.click(plus); // 15 → 16（1 回目の送信）
    fireEvent.click(plus); // 16 → 17（2 回目の送信）
    expect(within(card).getByText('17')).toBeInTheDocument();
    expect(calls).toHaveLength(2);

    // 1 回目（古い値 16 を送った方）が後から失敗しても、2 回目（成功した 17）を巻き戻さない
    calls[1].resolve(okResponse());
    await waitFor(() => expect(calls[1]).toBeDefined());
    calls[0].resolve(errorResponse('通信に失敗しました。'));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(within(card).getByText('17')).toBeInTheDocument();
  });

  test('StrictMode で描いても、1 回押した点は 1 回しか送らない', () => {
    const { fetchMock } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPageInStrictMode();
    const card = screen.getByTestId('court-card-1');

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(card).getByText('16')).toBeInTheDocument();
  });

  test('保存に失敗したあと、次の保存が成功するとエラーの帯が消える', async () => {
    const { fetchMock, calls } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');
    const plus = within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' });

    fireEvent.click(plus);
    calls[0].resolve(errorResponse('通信に失敗しました。'));
    await waitFor(() => expect(screen.getByText('通信に失敗しました。')).toBeInTheDocument());

    fireEvent.click(plus);
    calls[1].resolve(okResponse());

    await waitFor(() => expect(screen.queryByText('通信に失敗しました。')).not.toBeInTheDocument());
  });

  test('送信中に Realtime で古い値が届いても、送信中の得点は上書きされない', async () => {
    const { fetchMock } = deferredFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const card = screen.getByTestId('court-card-1');

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));
    expect(within(card).getByText('16')).toBeInTheDocument();

    // 自分が送信している最中に、まだ古い値（15-12）の Realtime 通知が届いた
    expect(capturedOnGameScoreChange).not.toBeNull();
    act(() =>
      capturedOnGameScoreChange!({
        matchId: 'sample-match-1',
        gameNumber: 1,
        sideAScore: 15,
        sideBScore: 12,
      })
    );

    // 送信中の自分の値（16）のまま。古い値に巻き戻らない。
    expect(within(card).getByText('16')).toBeInTheDocument();
    expect(within(card).queryByText('15')).not.toBeInTheDocument();
  });

  test('自分が触っていない試合の Realtime 更新は、そのまま画面に反映される', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse())
    );
    renderPage();
    const card = screen.getByTestId('court-card-2');

    // コート2 は 山田・中川（A）20点から始まる
    expect(within(card).getByText('20')).toBeInTheDocument();

    expect(capturedOnGameScoreChange).not.toBeNull();
    act(() =>
      capturedOnGameScoreChange!({
        matchId: 'sample-match-2',
        gameNumber: 1,
        sideAScore: 21,
        sideBScore: 19,
      })
    );

    expect(within(card).getByText('21')).toBeInTheDocument();
  });

  test('Realtime がつながっているときは帯が出ない', () => {
    mockConnectionStatus = 'connected';
    renderPage();

    expect(screen.queryByText(/画面を更新してください/)).not.toBeInTheDocument();
  });

  test('Realtime が切れると「画面を更新してください」の帯が出る', () => {
    mockConnectionStatus = 'disconnected';
    renderPage();

    expect(screen.getByText(/画面を更新してください/)).toBeInTheDocument();
  });
});
