import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourtsPage } from '@/ui/courts/courts-page';
import type { Court, CourtTeam } from '@/ui/courts/types';

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
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        teamA: team({ teamNumber: 1, players: ['佐々木', '井上'] }),
        teamB: team({ teamNumber: 2, players: ['田中', '木村'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 20, sideBScore: 19 }],
        maxGameCount: 1,
      },
      next: {
        classLabel: '2部',
        teamA: team({ teamNumber: 3, players: ['川口', '浜田'] }),
        teamB: team({ teamNumber: 4, players: ['小林', '西村'] }),
        isMine: false,
      },
    },
    {
      courtNumber: 2,
      live: {
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
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        teamA: team({ teamNumber: 3, players: ['松本', '中村'] }),
        teamB: team({ teamNumber: 4, players: ['加藤', '斎藤'] }),
        isMine: false,
        scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 5 }],
        maxGameCount: 1,
      },
      next: {
        classLabel: '1部',
        teamA: team({ teamNumber: 1, players: ['吉田', '山口'] }),
        teamB: team({ teamNumber: 2, players: ['佐藤', '森'] }),
        isMine: false,
      },
    },
    {
      // 決勝（上限3ゲーム）。第2ゲームまで入っている（5-8 進行中）。
      courtNumber: 5,
      live: {
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
      courtNumber: 7,
      live: null,
      next: {
        classLabel: '1部',
        teamA: team({ teamNumber: 3, players: ['斉藤', '坂本'] }),
        teamB: team({ teamNumber: 4, players: ['遠藤', '青木'] }),
        isMine: true,
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

  test('「まだ保存されません」の帯が出る', () => {
    renderPage();

    expect(
      screen.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toBeInTheDocument();
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
  });
});
