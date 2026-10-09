import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LiveChange } from '@/ui/courts/apply-live-change';
import { CourtsPage } from '@/ui/courts/courts-page';
import { appScoreSyncStore } from '@/ui/courts/use-score-sync';
import type { Court, CourtMatch, CourtTeam } from '@/ui/courts/types';

/**
 * 画面は読み直し（router.refresh）と、他の人の変化の受け取り（use-live-updates.ts）を使う。
 * どちらも本物は使わず、読み直しの回数を数え、変化は自分で届ける。
 */
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

type LiveConnection = 'connecting' | 'live' | 'down';
const liveMock = vi.hoisted(() => ({
  handlers: null as { onChange: (change: LiveChange) => void; onRecovered: () => void } | null,
  setConnection: null as ((connection: LiveConnection) => void) | null,
}));
vi.mock('@/ui/courts/use-live-updates', async () => {
  const { useState } = await import('react');
  return {
    useLiveUpdates: (handlers: NonNullable<typeof liveMock.handlers>) => {
      liveMock.handlers = handlers;
      const [connection, setConnection] = useState<LiveConnection>('connecting');
      liveMock.setConnection = setConnection;
      return connection;
    },
  };
});

/**
 * ＋−を押すと保存の入口（use-score-sync.ts）へ実際に fetch する。
 * ここでは画面の動き（表示・連打・呼出待ちの昇格）だけを見たいので、
 * 送信そのものは常に成功したことにしておく（送る・送り直す仕組み自体の確認は
 * use-score-sync.test.tsx が担当する）。
 */
beforeEach(() => {
  refresh.mockClear();
  liveMock.handlers = null;
  // 送れていない点の預かり場所はアプリ全体で 1 つ。前のテストの点を持ち越さない。
  appScoreSyncStore.dispose();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  );
});

afterEach(() => {
  appScoreSyncStore.dispose();
  vi.unstubAllGlobals();
});

function team(overrides: Partial<CourtTeam> = {}): CourtTeam {
  return { teamNumber: 1, players: [], slotLabel: null, ...overrides };
}

/**
 * 8 面ぶんの見本の値を自前で組む（`/courts` は DB につながったので、固定の
 * sample-data.ts はもう無い。`/me` と同じ形。src/ui/me/my-page.test.tsx）。
 */
function buildCourts(): Court[] {
  return [
    {
      // 予選（上限1ゲーム）。20-19 から始まる。押せば数字が動く。
      courtNumber: 1,
      live: {
        matchId: 'match-1',
        classLabel: { name: '1部', colorNumber: 1 },
        roundLabel: '予選 1回戦',
        teamA: team({ teamNumber: 1, players: ['佐々木', '井上'] }),
        teamB: team({ teamNumber: 2, players: ['田中', '木村'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 20, sideBScore: 19 }],
        maxGameCount: 1,
      },
      next: {
        matchId: 'match-1-next',
        classLabel: { name: '2部', colorNumber: 2 },
        roundLabel: '予選 2回戦',
        teamA: team({ teamNumber: 3, players: ['川口', '浜田'] }),
        teamB: team({ teamNumber: 4, players: ['小林', '西村'] }),
        isMine: false,
        maxGameCount: 1,
      },
    },
    {
      courtNumber: 2,
      live: {
        matchId: 'match-2',
        classLabel: { name: '2部', colorNumber: 2 },
        roundLabel: '予選 1回戦',
        teamA: team({ teamNumber: 3, players: ['山田', '中川'] }),
        teamB: team({ teamNumber: 4, players: ['清水', '岡本'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 14, sideBScore: 11 }],
        maxGameCount: 1,
      },
      next: null,
    },
    {
      // 0対0のまま。「まだ点が入っていません」を確かめる。自分の試合。
      courtNumber: 3,
      live: {
        matchId: 'match-3',
        classLabel: { name: '3部', colorNumber: 3 },
        roundLabel: '予選 2回戦',
        teamA: team({ teamNumber: 1, players: ['鈴木', '高橋'] }),
        teamB: team({ teamNumber: 2, players: ['伊藤', '渡辺'] }),
        isMine: true,
        scores: [],
        maxGameCount: 1,
      },
      next: null,
    },
    {
      // 「＋」の連打テストに使う。加藤・斎藤（B）5点。
      courtNumber: 4,
      live: {
        matchId: 'match-4',
        classLabel: { name: '1部', colorNumber: 1 },
        roundLabel: '予選 2回戦',
        teamA: team({ teamNumber: 3, players: ['松本', '中村'] }),
        teamB: team({ teamNumber: 4, players: ['加藤', '斎藤'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 5 }],
        maxGameCount: 1,
      },
      next: {
        matchId: 'match-4-next',
        classLabel: { name: '1部', colorNumber: 1 },
        roundLabel: '予選 3回戦',
        teamA: team({ teamNumber: 1, players: ['吉田', '山口'] }),
        teamB: team({ teamNumber: 2, players: ['佐藤', '森'] }),
        isMine: false,
        maxGameCount: 1,
      },
    },
    {
      // 決勝（上限3ゲーム）。第2ゲームまで入っている（5-8 進行中）。
      courtNumber: 5,
      live: {
        matchId: 'match-5',
        classLabel: { name: '2部', colorNumber: 2 },
        roundLabel: '決勝トーナメント 準決勝',
        teamA: team({ teamNumber: 1, players: ['石川', '前田'] }),
        teamB: team({ teamNumber: 2, players: ['藤田', '岡田'] }),
        isMine: false,
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
          { gameNumber: 2, sideAScore: 5, sideBScore: 8 },
        ],
        maxGameCount: 3,
      },
      next: null,
    },
    {
      // 決勝（上限3ゲーム）。1-1 で同点。
      courtNumber: 6,
      live: {
        matchId: 'match-6',
        classLabel: { name: '3部', colorNumber: 3 },
        roundLabel: '決勝トーナメント 準決勝',
        teamA: team({ teamNumber: 3, players: ['長谷川', '五十嵐'] }),
        teamB: team({ teamNumber: 4, players: ['小早川', '日下部'] }),
        isMine: false,
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
          { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
        ],
        maxGameCount: 3,
      },
      next: null,
    },
    {
      // 呼出待ち。選手（canInput）なら次の試合の枠が出る。
      courtNumber: 7,
      live: null,
      next: {
        matchId: 'match-7-next',
        classLabel: { name: '1部', colorNumber: 1 },
        roundLabel: '予選 4回戦',
        teamA: team({ teamNumber: 3, players: ['斉藤', '坂本'] }),
        teamB: team({ teamNumber: 4, players: ['遠藤', '青木'] }),
        isMine: true,
        maxGameCount: 1,
      },
    },
  ];
}

/**
 * コートのカードの形で書いた見本を、画面が受け取る試合の一覧（`CourtMatch[]`）に直す。
 * 順番は並びの先頭から 1, 2, ... を振る（進行中が先、次の試合が後）。
 */
function boardFromCourts(courts: Court[]): CourtMatch[] {
  return courts.flatMap((court) => {
    const matches: CourtMatch[] = [];
    if (court.live) {
      matches.push({
        ...court.live,
        status: 'live',
        courtNumber: court.courtNumber,
        orderInCourt: 1,
        finishedAt: null,
        reopened: false,
      });
    }
    if (court.next) {
      matches.push({
        ...court.next,
        status: 'waiting',
        courtNumber: court.courtNumber,
        orderInCourt: 2,
        finishedAt: null,
        reopened: false,
        scores: [],
      });
    }
    return matches;
  });
}

type PageOverrides = Partial<Omit<React.ComponentProps<typeof CourtsPage>, 'board'>> & {
  courts?: Court[];
  board?: CourtMatch[];
};

function renderPage({ courts = buildCourts(), board, ...overrides }: PageOverrides = {}) {
  return render(
    <CourtsPage
      board={board ?? boardFromCourts(courts)}
      stageLabel="予選リーグ"
      completedMatches={2}
      totalMatches={48}
      canInput
      emptyReason={null}
      truncated={false}
      {...overrides}
    />
  );
}

describe('CourtsPage', () => {
  test('見出し「結果LIVE」が出る', () => {
    renderPage();
    expect(screen.getByText('結果LIVE')).toBeInTheDocument();
  });

  test('渡された段のラベルと消化数が出る', () => {
    renderPage();

    expect(screen.getByText('予選リーグ')).toBeInTheDocument();
    expect(screen.getByText('2/48 試合消化')).toBeInTheDocument();
  });

  test('決勝トーナメントに切り替わったラベルもそのまま出る', () => {
    renderPage({ stageLabel: '決勝トーナメント', completedMatches: 0, totalMatches: 3 });

    expect(screen.getByText('決勝トーナメント')).toBeInTheDocument();
    expect(screen.getByText('0/3 試合消化')).toBeInTheDocument();
  });

  test('選手には「試合の終了はまだ記録されません」の帯が出る', () => {
    renderPage({ canInput: true });

    expect(
      screen.getByText('試合の終了はまだ記録されません（点は保存されます）')
    ).toBeInTheDocument();
  });

  test('観戦者には帯が出ない', () => {
    renderPage({ canInput: false });

    expect(
      screen.queryByText('試合の終了はまだ記録されません（点は保存されます）')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).not.toBeInTheDocument();
  });

  test('渡されたコートの数だけカードが出る（8 枚に固定しない）', () => {
    renderPage();

    for (let courtNumber = 1; courtNumber <= 7; courtNumber += 1) {
      expect(screen.getByTestId(`court-card-${courtNumber}`)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^court-card-/)).toHaveLength(7);
  });

  test('9・10 番のコートだけが渡されたら、その 2 枚だけが出る（番号の飛んだ並びのまま）', () => {
    const courts: Court[] = [9, 10].map((courtNumber) => ({
      courtNumber,
      live: null,
      next: {
        matchId: `match-${courtNumber}-next`,
        classLabel: { name: '1部', colorNumber: 1 },
        roundLabel: '予選 1回戦',
        teamA: team({ players: ['斉藤', '坂本'] }),
        teamB: team({ players: ['遠藤', '青木'] }),
        isMine: false,
        maxGameCount: 1,
      },
    }));
    renderPage({ courts });

    expect(screen.getAllByTestId(/^court-card-/).map((card) => card.dataset.testid)).toEqual([
      'court-card-9',
      'court-card-10',
    ]);
  });

  describe('コートのカードが 0 枚のとき、理由ごとの案内を出す', () => {
    test('コートがまだ決まっていないとき「コートがまだ決まっていません」', () => {
      // コートが決まっていない試合だけが残っている
      renderPage({
        board: boardFromCourts([{ courtNumber: 1, live: null, next: buildCourts()[0].next }]).map(
          (match) => ({ ...match, courtNumber: null })
        ),
        emptyReason: 'courts-undecided',
      });

      expect(screen.getByText('コートがまだ決まっていません')).toBeInTheDocument();
      expect(screen.queryByText('全部終わりました')).not.toBeInTheDocument();
    });

    test('全部終わったとき「全部終わりました」と、対戦表へのリンクが出る', () => {
      renderPage({ courts: [], emptyReason: 'all-finished' });

      expect(screen.getByText('全部終わりました')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /対戦表/ })).toHaveAttribute('href', '/bracket');
      expect(screen.queryByText('コートがまだ決まっていません')).not.toBeInTheDocument();
    });

    test('試合が 1 つも登録されていないときは、別の文面で案内する', () => {
      renderPage({ courts: [], emptyReason: 'no-matches' });

      expect(screen.getByText('まだ試合が登録されていません')).toBeInTheDocument();
      expect(screen.queryByText('全部終わりました')).not.toBeInTheDocument();
      expect(screen.queryByText('コートがまだ決まっていません')).not.toBeInTheDocument();
    });

    test('カードがあるときは案内を出さない', () => {
      renderPage();

      expect(screen.queryByText('コートがまだ決まっていません')).not.toBeInTheDocument();
      expect(screen.queryByText('全部終わりました')).not.toBeInTheDocument();
    });
  });

  describe('読み込みが上限を超えたとき', () => {
    test('黙らず、出しきれていないかもしれないと日本語で知らせる', () => {
      renderPage({ truncated: true });

      expect(screen.getByRole('alert')).toHaveTextContent('出しきれていない');
    });

    test('超えていなければ知らせない', () => {
      renderPage({ truncated: false });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  test('「＋」を押すと得点が1増える', () => {
    renderPage();
    const card = screen.getByTestId('court-card-1');

    expect(within(card).getByText('20')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
    );
    expect(within(card).getByText('21')).toBeInTheDocument();
  });

  test('「−」を押すと得点が1減る', () => {
    renderPage();
    const card = screen.getByTestId('court-card-1');

    expect(within(card).getByText('19')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '田中・木村の第1ゲームの得点を1減らす' })
    );
    expect(within(card).getByText('18')).toBeInTheDocument();
  });

  test('「−」を押しても0より下にはならない', () => {
    renderPage();
    const card = screen.getByTestId('court-card-4');

    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(
        within(card).getByRole('button', { name: '加藤・斎藤の第1ゲームの得点を1減らす' })
      );
    }
    expect(within(card).getByText('0')).toBeInTheDocument();
  });

  test('コートごとに得点の増減が独立している（他のコートに影響しない）', () => {
    renderPage();
    const card1 = screen.getByTestId('court-card-1');
    const card2 = screen.getByTestId('court-card-2');

    fireEvent.click(
      within(card1).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
    );

    expect(within(card1).getByText('21')).toBeInTheDocument();
    expect(within(card2).getByText('14')).toBeInTheDocument();
  });

  test('決勝（上限3ゲーム）は、第2ゲームの枠に既に入っている点をそのまま押して動かせる', () => {
    renderPage();
    const card = screen.getByTestId('court-card-5');

    expect(within(card).getByText('第1ゲーム')).toBeInTheDocument();
    expect(within(card).getByText('第2ゲーム')).toBeInTheDocument();
    expect(within(card).getByText('第3ゲーム')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '藤田・岡田の第2ゲームの得点を1増やす' })
    );
    expect(within(card).getByText('9')).toBeInTheDocument();
  });

  test('勝ちゲーム数に差が付いていれば「試合を終了する」→確認画面の「OK」で試合終了になる', () => {
    renderPage();
    const card = screen.getByTestId('court-card-4');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
    expect(screen.getByText('この試合を終了します')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(within(card).getByText('終了')).toBeInTheDocument();
    expect(within(card).queryByText('LIVE')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '試合を終了する' })).not.toBeInTheDocument();
    expect(within(card).getByText('第1ゲーム 8-5')).toBeInTheDocument();
    expect(within(card).getByText(/勝ち/)).toBeInTheDocument();
    expect(within(card).getByText(/1-0/)).toBeInTheDocument();
  });

  test('確認画面で「戻る」を押すと何も変わらずに閉じる', () => {
    renderPage();
    const card = screen.getByTestId('court-card-4');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByText('LIVE')).toBeInTheDocument();
  });

  test('0対0のコートで「試合を終了する」を押すと「まだ点が入っていません」と出て、確認画面は出ない', () => {
    renderPage();
    const card = screen.getByTestId('court-card-3');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));

    expect(within(card).getByRole('status')).toHaveTextContent('まだ点が入っていません');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('同点（勝ちゲーム数が同数）のコートで「試合を終了する」を押すと「同点では終了できません」と出る', () => {
    renderPage();
    const card = screen.getByTestId('court-card-6');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));

    expect(within(card).getByRole('status')).toHaveTextContent('同点では終了できません');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('canInput が false（観戦者）', () => {
    test('どのコートにも「−」「＋」「試合を終了する」が出ない', () => {
      renderPage({ canInput: false });

      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '試合を終了する' })).not.toBeInTheDocument();
    });

    test('得点は数字で見える', () => {
      renderPage({ canInput: false });
      const card = screen.getByTestId('court-card-1');

      expect(within(card).getByText('20')).toBeInTheDocument();
      expect(within(card).getByText('19')).toBeInTheDocument();
    });

    test('呼出待ちのコートに枠は出ない（今までどおり見るだけ）', () => {
      renderPage({ canInput: false });
      const card = screen.getByTestId('court-card-7');

      expect(within(card).getByText('呼出待ち')).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
    });
  });

  describe('保存（use-score-sync.ts を通して入口に送る）', () => {
    test('「＋」を押すと、そのゲームの今の点数が保存の入口に送られる', async () => {
      renderPage();
      const card = screen.getByTestId('court-card-1');

      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );

      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('/api/matches/match-1/scores');
      expect(JSON.parse(init?.body as string)).toEqual({
        gameNumber: 1,
        sideAScore: 21,
        sideBScore: 19,
      });
    });

    test('描き直される前に「＋」を10回押しても1点も落とさず、最後に送る点数も10増えた値になる', async () => {
      renderPage();
      const card = screen.getByTestId('court-card-4');
      const plus = within(card).getByRole('button', {
        name: '加藤・斎藤の第1ゲームの得点を1増やす',
      });

      // 1 つの act の中で押すと、10 回押し終わるまで描き直されない（いちばん厳しい連打）
      act(() => {
        for (let i = 0; i < 10; i += 1) fireEvent.click(plus);
      });

      expect(within(card).getByText('15', { exact: true })).toBeInTheDocument();
      await waitFor(() => {
        const calls = vi.mocked(fetch).mock.calls;
        expect(JSON.parse(calls[calls.length - 1][1]?.body as string)).toEqual({
          gameNumber: 1,
          sideAScore: 8,
          sideBScore: 15,
        });
      });
    });

    test('保存に失敗すると「保存できていません」の案内が出る', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
      renderPage();
      const card = screen.getByTestId('court-card-1');

      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );

      await waitFor(() =>
        expect(within(card).getByRole('status')).toHaveTextContent('保存できていません')
      );
    });
  });

  describe('呼出待ちのコートで選手が点を入れる', () => {
    test('次の試合の枠が出て、押せる', () => {
      renderPage();
      const card = screen.getByTestId('court-card-7');

      expect(screen.getByText('呼出待ち')).toBeInTheDocument();
      expect(within(card).getByText('第1ゲーム')).toBeInTheDocument();
      expect(
        within(card).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1増やす' })
      ).toBeInTheDocument();
    });

    test('最初の1点でLIVEの見た目に切り替わる', () => {
      renderPage();
      const card = screen.getByTestId('court-card-7');

      fireEvent.click(
        within(card).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1増やす' })
      );

      expect(within(card).getByText('LIVE')).toBeInTheDocument();
      expect(within(card).queryByText('呼出待ち')).not.toBeInTheDocument();
      expect(within(card).getByText('1', { exact: true })).toBeInTheDocument();
    });

    test('1点入れてから0対0に戻しても、LIVEの見た目のまま（入口の側も呼出待ちに戻さない）', () => {
      renderPage();
      const card = screen.getByTestId('court-card-7');

      fireEvent.click(
        within(card).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1増やす' })
      );
      fireEvent.click(
        within(card).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1減らす' })
      );

      expect(within(card).getByText('LIVE')).toBeInTheDocument();
      expect(within(card).queryByText('呼出待ち')).not.toBeInTheDocument();
    });

    test('最初の1点も保存の入口に送られる', async () => {
      renderPage();
      const card = screen.getByTestId('court-card-7');

      fireEvent.click(
        within(card).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1増やす' })
      );

      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('/api/matches/match-7-next/scores');
      expect(JSON.parse(init?.body as string)).toEqual({
        gameNumber: 1,
        sideAScore: 1,
        sideBScore: 0,
      });
    });
  });

  // 仕様 2026-10-04: 送れていない点は、結果LIVE の画面より長生きする。
  // 下のメニューで別の画面に移る = この画面を外す（unmount）、戻る = 作り直す（render）。
  describe('別の画面に移っても、送れていない点を預かる', () => {
    const PLUS_COURT_1 = '佐々木・井上の第1ゲームの得点を1増やす';

    test('送れない状態で「＋」を押して画面を外しても、送り直しを続けて保存の入口に届く', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const first = renderPage();
      fireEvent.click(
        within(screen.getByTestId('court-card-1')).getByRole('button', { name: PLUS_COURT_1 })
      );
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

      first.unmount();

      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2), { timeout: 3000 });
      expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({
        gameNumber: 1,
        sideAScore: 21,
        sideBScore: 19,
      });
    });

    test('送れていない点があるまま結果LIVE に戻ると、押した数字のまま「保存できていません」が出る', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      const first = renderPage();
      fireEvent.click(
        within(screen.getByTestId('court-card-1')).getByRole('button', { name: PLUS_COURT_1 })
      );
      await waitFor(() =>
        expect(within(screen.getByTestId('court-card-1')).getByRole('status')).toHaveTextContent(
          '保存できていません'
        )
      );
      first.unmount();

      // サーバーから読み直した数字は、まだ押す前の 20-19
      renderPage();
      const card = screen.getByTestId('court-card-1');

      expect(within(card).getByText('21', { exact: true })).toBeInTheDocument();
      expect(within(card).queryByText('20', { exact: true })).not.toBeInTheDocument();
      expect(within(card).getByRole('status')).toHaveTextContent('保存できていません');
    });

    test('別の画面にいる間に保存できたら、戻ったとき「保存できていません」は出ていない', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      const first = renderPage();
      fireEvent.click(
        within(screen.getByTestId('court-card-1')).getByRole('button', { name: PLUS_COURT_1 })
      );
      await waitFor(() =>
        expect(within(screen.getByTestId('court-card-1')).getByRole('status')).toBeInTheDocument()
      );
      first.unmount();
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2), { timeout: 3000 });
      // 返事が預かり場所に反映されるのを待つ
      await act(async () => {
        await Promise.resolve();
      });

      // サーバーは保存された 21-19 を返す
      const courts = buildCourts();
      courts[0].live!.scores = [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }];
      renderPage({ courts });
      const card = screen.getByTestId('court-card-1');

      expect(within(card).getByText('21', { exact: true })).toBeInTheDocument();
      expect(within(card).queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByText(/保存できていません/)).not.toBeInTheDocument();
    });

    test('呼出待ちのコートで入れた最初の 1 点が送れていないまま戻ると、LIVE の見た目で数字が残る', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      const first = renderPage();
      fireEvent.click(
        within(screen.getByTestId('court-card-7')).getByRole('button', {
          name: '斉藤・坂本の第1ゲームの得点を1増やす',
        })
      );
      await waitFor(() =>
        expect(within(screen.getByTestId('court-card-7')).getByRole('status')).toBeInTheDocument()
      );
      first.unmount();

      renderPage();
      const card = screen.getByTestId('court-card-7');

      expect(within(card).getByText('LIVE')).toBeInTheDocument();
      expect(within(card).getByText('1', { exact: true })).toBeInTheDocument();
      expect(within(card).getByRole('status')).toHaveTextContent('保存できていません');
    });

    test('呼出待ちのコートで 1 点入れて 0 対 0 に戻し、送れていないまま戻っても LIVE の見た目のまま', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      const first = renderPage();
      const firstCard = screen.getByTestId('court-card-7');
      fireEvent.click(
        within(firstCard).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1増やす' })
      );
      fireEvent.click(
        within(firstCard).getByRole('button', { name: '斉藤・坂本の第1ゲームの得点を1減らす' })
      );
      await waitFor(() => expect(within(firstCard).getByRole('status')).toBeInTheDocument());
      expect(within(firstCard).getByText('LIVE')).toBeInTheDocument();
      first.unmount();

      renderPage();
      const card = screen.getByTestId('court-card-7');

      expect(within(card).getByText('LIVE')).toBeInTheDocument();
      expect(within(card).queryByText('呼出待ち')).not.toBeInTheDocument();
      expect(within(card).getByRole('status')).toHaveTextContent('保存できていません');
    });

    // 選手として押した点が送れないまま、観戦者として入り直して結果LIVE を開いた場合。
    // 観戦者は点を入れないので、預かっている数字も案内も混ぜない。
    test('選手として押した点が送れていないまま観戦者で開いても、数字も「保存できていません」も混ざらない', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network down'));
      const first = renderPage();
      fireEvent.click(
        within(screen.getByTestId('court-card-1')).getByRole('button', { name: PLUS_COURT_1 })
      );
      await waitFor(() =>
        expect(within(screen.getByTestId('court-card-1')).getByRole('status')).toBeInTheDocument()
      );
      first.unmount();

      renderPage({ canInput: false });
      const card = screen.getByTestId('court-card-1');

      expect(within(card).getByText('20', { exact: true })).toBeInTheDocument();
      expect(within(card).queryByText('21', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByText(/保存できていません/)).not.toBeInTheDocument();
    });
  });

  describe('送れていない点がある試合で「試合を終了する」を押したとき', () => {
    function finishCourt1() {
      const card = screen.getByTestId('court-card-1');
      fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      return card;
    }

    test('終了しても「保存できていません」の案内が消えない。送れたら消える', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      renderPage();
      const card = screen.getByTestId('court-card-1');
      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );
      await waitFor(() => expect(within(card).getByRole('status')).toBeInTheDocument());

      finishCourt1();

      expect(within(card).getByText('終了')).toBeInTheDocument();
      expect(within(card).getByRole('status')).toHaveTextContent('保存できていません');

      // 送り直しが成功すると、終了したカードからも案内が消える
      await waitFor(() => expect(within(card).queryByRole('status')).not.toBeInTheDocument(), {
        timeout: 3000,
      });
    });

    test('送れている試合を終了しても、案内は出ない', async () => {
      renderPage();
      const card = screen.getByTestId('court-card-1');
      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));

      finishCourt1();

      expect(within(card).getByText('終了')).toBeInTheDocument();
      expect(within(card).queryByRole('status')).not.toBeInTheDocument();
    });
  });

  /**
   * 他の人の点や試合の変化が、その場で映る（use-live-updates.ts が届ける）。
   * 届いた行だけを当てる。画面全体は読み直さない（router.refresh を呼ばない）。
   */
  describe('他の人の変化がその場で映る', () => {
    function deliver(change: LiveChange) {
      act(() => liveMock.handlers!.onChange(change));
    }

    function score(matchId: string, sideAScore: number, sideBScore: number): LiveChange {
      return { kind: 'score', matchId, gameNumber: 1, sideAScore, sideBScore };
    }

    test('他の人が入れた点が届くと、開き直さなくても数字が変わる。画面は読み直さない', async () => {
      renderPage({ canInput: false });
      const card = screen.getByTestId('court-card-1');
      expect(within(card).getByText('20')).toBeInTheDocument();

      deliver(score('match-1', 21, 19));

      expect(within(card).getByText('21')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(refresh).not.toHaveBeenCalled();
    });

    test('観戦者にも映る', () => {
      renderPage({ canInput: false });

      deliver(score('match-2', 15, 11));

      const card = screen.getByTestId('court-card-2');
      expect(within(card).getByText('15')).toBeInTheDocument();
      expect(within(card).getByText('11')).toBeInTheDocument();
    });

    test('選手にも映る', () => {
      renderPage({ canInput: true });

      deliver(score('match-2', 15, 11));

      expect(within(screen.getByTestId('court-card-2')).getByText('15')).toBeInTheDocument();
    });

    test('点が何回変わっても、そのたびに読み直さない', async () => {
      renderPage({ canInput: false });

      for (let point = 21; point <= 40; point += 1) deliver(score('match-1', point, 19));

      expect(within(screen.getByTestId('court-card-1')).getByText('40')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(refresh).not.toHaveBeenCalled();
    });

    test('送れていない手元の点は、届いた古い点で上書きされない', async () => {
      // 保存の返事が来ない（送信中のまま）状態にする
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
      renderPage({ canInput: true });
      const card = screen.getByTestId('court-card-1');

      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );
      expect(within(card).getByText('21')).toBeInTheDocument();

      // 届いたのは少し前の点（20）
      deliver(score('match-1', 20, 19));

      expect(within(card).getByText('21')).toBeInTheDocument();
    });

    test('手元に無い試合の変化が届いたら、1 回だけ読み直す（続けて届いても 1 回）', async () => {
      renderPage();

      deliver(score('somewhere-else', 3, 1));
      deliver({
        kind: 'match',
        matchId: 'somewhere-else-2',
        status: 'live',
        courtNumber: 9,
        orderInCourt: 1,
        finishedAt: null,
        maxGameCount: 1,
      });

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    test('次の試合が始まると、そのコートが進行中の表示に切り替わる', () => {
      renderPage({ canInput: false });
      expect(within(screen.getByTestId('court-card-1')).getByText('佐々木')).toBeInTheDocument();

      // コート 1: いまの試合が終わる → 次の試合が始まる
      deliver({
        kind: 'match',
        matchId: 'match-1',
        status: 'done',
        courtNumber: 1,
        orderInCourt: 1,
        finishedAt: '2026-10-09T01:00:00+00:00',
        maxGameCount: 1,
      });
      deliver({
        kind: 'match',
        matchId: 'match-1-next',
        status: 'live',
        courtNumber: 1,
        orderInCourt: 2,
        finishedAt: null,
        maxGameCount: 1,
      });

      // 進行中になった試合（元の「次」）の2部・川口・浜田が出て、終わった試合の名前は消える
      const card = screen.getByTestId('court-card-1');
      expect(within(card).getByText('LIVE')).toBeInTheDocument();
      expect(within(card).getByText('2部')).toBeInTheDocument();
      expect(within(card).getByText('川口')).toBeInTheDocument();
      expect(within(card).queryByText('佐々木')).not.toBeInTheDocument();
    });

    test('試合が終わると、そのコートは次の試合の呼出待ちに切り替わる', () => {
      renderPage({ canInput: false });

      deliver({
        kind: 'match',
        matchId: 'match-1',
        status: 'done',
        courtNumber: 1,
        orderInCourt: 1,
        finishedAt: '2026-10-09T01:00:00+00:00',
        maxGameCount: 1,
      });

      const card = screen.getByTestId('court-card-1');
      expect(within(card).getByText('呼出待ち')).toBeInTheDocument();
      expect(within(card).queryByText('LIVE')).not.toBeInTheDocument();
    });

    test('読み直された一覧が渡されたら、置き換わる。送れていない点は残る', async () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
      const view = renderPage({ canInput: true });
      const card = screen.getByTestId('court-card-1');
      fireEvent.click(
        within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
      );

      // 読み直した一覧は、押す前の点（20 対 19）。別のコートの点は進んでいる
      const reloaded = boardFromCourts(buildCourts()).map((match) =>
        match.matchId === 'match-2'
          ? { ...match, scores: [{ gameNumber: 1, sideAScore: 25, sideBScore: 11 }] }
          : match
      );
      view.rerender(
        <CourtsPage
          board={reloaded}
          stageLabel="予選リーグ"
          completedMatches={2}
          totalMatches={48}
          canInput
          emptyReason={null}
          truncated={false}
        />
      );

      // 読み直した一覧に置き換わる（別のコートの点が進んでいる）
      await waitFor(() =>
        expect(within(screen.getByTestId('court-card-2')).getByText('25')).toBeInTheDocument()
      );
      // 送れていない自分の点（21 対 19）は、読み直した数字（20 対 19）より優先して残る
      expect(within(card).getByText('21')).toBeInTheDocument();
      expect(within(card).queryByText('20')).not.toBeInTheDocument();
    });
  });

  describe('自動更新が途切れたとき', () => {
    test('つながっている間と、開いた直後は案内を出さない', () => {
      renderPage();
      expect(screen.queryByText(/自動更新が止まっています/)).not.toBeInTheDocument();

      act(() => liveMock.setConnection!('live'));
      expect(screen.queryByText(/自動更新が止まっています/)).not.toBeInTheDocument();
    });

    test('途切れたら「自動更新が止まっています」が出て、つながると消える', () => {
      renderPage();

      act(() => liveMock.setConnection!('down'));
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
        '自動更新が止まっています'
      );

      act(() => liveMock.setConnection!('live'));
      expect(screen.queryByText(/自動更新が止まっています/)).not.toBeInTheDocument();
    });

    test('観戦者にも案内が出る', () => {
      renderPage({ canInput: false });

      act(() => liveMock.setConnection!('down'));

      expect(screen.getByText(/自動更新が止まっています/)).toBeInTheDocument();
    });

    test('つながり直したら、1 回だけ読み直す', async () => {
      renderPage();

      act(() => liveMock.handlers!.onRecovered());

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1), { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
