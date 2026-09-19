import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CourtsPage } from '@/ui/courts/courts-page';
import type { Court, CourtTeam } from '@/ui/courts/types';

/**
 * ＋−を押すと保存の入口（use-score-sync.ts）へ実際に fetch する。
 * ここでは画面の動き（表示・連打・呼出待ちの昇格）だけを見たいので、
 * 送信そのものは常に成功したことにしておく（送る・送り直す仕組み自体の確認は
 * use-score-sync.test.tsx が担当する）。
 */
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  );
});

afterEach(() => {
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
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        teamA: team({ teamNumber: 1, players: ['佐々木', '井上'] }),
        teamB: team({ teamNumber: 2, players: ['田中', '木村'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 20, sideBScore: 19 }],
        maxGameCount: 1,
      },
      next: {
        matchId: 'match-1-next',
        classLabel: '2部',
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
        classLabel: '2部',
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
        classLabel: '3部',
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
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        teamA: team({ teamNumber: 3, players: ['松本', '中村'] }),
        teamB: team({ teamNumber: 4, players: ['加藤', '斎藤'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 5 }],
        maxGameCount: 1,
      },
      next: {
        matchId: 'match-4-next',
        classLabel: '1部',
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
        classLabel: '2部',
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
        classLabel: '3部',
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
        classLabel: '1部',
        roundLabel: '予選 4回戦',
        teamA: team({ teamNumber: 3, players: ['斉藤', '坂本'] }),
        teamB: team({ teamNumber: 4, players: ['遠藤', '青木'] }),
        isMine: true,
        maxGameCount: 1,
      },
    },
    {
      courtNumber: 8,
      live: null,
      next: null,
    },
  ];
}

function renderPage(overrides: Partial<React.ComponentProps<typeof CourtsPage>> = {}) {
  return render(
    <CourtsPage
      courts={buildCourts()}
      stageLabel="予選リーグ"
      completedMatches={2}
      totalMatches={48}
      canInput
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

  test('コートのカードが8枚出る', () => {
    renderPage();

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      expect(screen.getByTestId(`court-card-${courtNumber}`)).toBeInTheDocument();
    }
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
});
