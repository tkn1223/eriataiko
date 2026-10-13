import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MatchesPage } from '@/ui/matches/matches-page';
import { boardMatch } from '@/ui/matches/test-support';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 画面は読み直し（router.refresh）と、他の人の変化の受け取り（結果LIVE と共有の
 * use-live-updates.ts）を使う。この中は表示の確認だけなので、どちらも何もしない偽物にする
 * （受け取りと読み直しの確認は matches-live.test.tsx）。
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/courts/use-live-updates', () => ({ useLiveUpdates: () => 'live' }));

/**
 * 進行表の画面。見るだけで、得点を入れる場所は結果LIVE だけ。
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

/** 見出しの文字列は区切りの空白を挟まず連結される（例: 「コート1現在3試合目残り4試合」）。
 *  「コート1」の直後に別の数字が続かないことだけを見て、他のコート番号と区別する。 */
function courtHeadingName(courtNumber: number) {
  return new RegExp(`^コート${courtNumber}(?!\\d)`);
}

/** コート 1 は 終了 2・進行中 1・これから 3。うち 1 つ（終了のほう）が自分の試合。 */
function court1Matches(): BoardMatch[] {
  return [
    boardMatch({
      matchId: 'c1-1',
      orderInCourt: 1,
      status: 'done',
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
    }),
    boardMatch({
      matchId: 'c1-2',
      orderInCourt: 2,
      status: 'done',
      isMine: true,
      teamA: { teamNumber: 3, players: ['渡辺', '小林'], slotLabel: null },
      teamB: { teamNumber: 4, players: ['山本', '松本'], slotLabel: null },
      scores: [{ gameNumber: 1, sideAScore: 18, sideBScore: 21 }],
    }),
    boardMatch({
      matchId: 'c1-3',
      orderInCourt: 3,
      status: 'live',
      teamA: { teamNumber: 1, players: ['中村'], slotLabel: null },
      teamB: { teamNumber: 2, players: ['加藤'], slotLabel: null },
      scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
    }),
    boardMatch({ matchId: 'c1-4', orderInCourt: 4, status: 'waiting' }),
    boardMatch({ matchId: 'c1-5', orderInCourt: 5, status: 'waiting' }),
    boardMatch({ matchId: 'c1-6', orderInCourt: 6, status: 'waiting' }),
  ];
}

function renderPage({
  board = court1Matches(),
  canFilterMine = true,
  truncated = false,
}: {
  board?: BoardMatch[];
  canFilterMine?: boolean;
  truncated?: boolean;
} = {}) {
  return render(<MatchesPage board={board} canFilterMine={canFilterMine} truncated={truncated} />);
}

describe('MatchesPage', () => {
  test('見出し「進行表」が出る', () => {
    renderPage();
    expect(screen.getByText('進行表')).toBeInTheDocument();
  });

  test('本物の試合（部・両ペアの名前・点数）が出る。見本の名前は出ない', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));

    const live = screen.getByTestId('match-row-c1-3');
    expect(live).toHaveTextContent('3試合目');
    expect(live).toHaveTextContent('1部');
    expect(live).toHaveTextContent('中村');
    expect(live).toHaveTextContent('加藤');
    expect(live).toHaveTextContent('12-9');
    // 見本データの名前（sample-data.ts にあった名前）は出ない
    expect(screen.queryByText(/杉山|増田|須藤/)).not.toBeInTheDocument();
  });

  test('コートのカードは試合のあるコートだけ、番号順に出る（9・10 番も、飛び番号もそのまま）', () => {
    renderPage({
      board: [
        boardMatch({ matchId: 'a', courtNumber: 10 }),
        boardMatch({ matchId: 'b', courtNumber: 2 }),
        boardMatch({ matchId: 'c', courtNumber: 9 }),
      ],
    });

    const headings = screen
      .getAllByRole('button', { name: /^コート\d/ })
      .map((button) => button.textContent?.match(/^コート(\d+)/)?.[1]);
    expect(headings).toEqual(['2', '9', '10']);
    // 試合の無いコート（1・3〜8）のカードは出ない
    expect(screen.queryByRole('button', { name: courtHeadingName(1) })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: courtHeadingName(3) })).not.toBeInTheDocument();
  });

  test('コートが決まっていない試合は、最後に「コート未定」としてまとまる', () => {
    renderPage({
      board: [
        boardMatch({ matchId: 'u', courtNumber: null, orderInCourt: null }),
        boardMatch({ matchId: 'a', courtNumber: 3 }),
      ],
    });

    const headings = screen.getAllByRole('button', { name: /^コート/ });
    expect(headings.map((button) => button.textContent)).toEqual([
      expect.stringMatching(/^コート3/),
      expect.stringMatching(/^コート未定/),
    ]);
  });

  test('見出しを押すと中身が開いたり閉じたりする', () => {
    renderPage();

    expect(screen.queryByTestId('match-row-c1-4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));
    expect(screen.getByTestId('match-row-c1-4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));
    expect(screen.queryByTestId('match-row-c1-4')).not.toBeInTheDocument();
  });

  test('見出しに「現在◯試合目」「残り◯試合」が試合の状態どおりに出る', () => {
    renderPage({
      board: [
        ...court1Matches(),
        boardMatch({ matchId: 'c2-1', courtNumber: 2, orderInCourt: 1, status: 'done' }),
      ],
    });

    const heading1 = screen.getByRole('button', { name: courtHeadingName(1) });
    expect(heading1).toHaveTextContent('現在3試合目');
    expect(heading1).toHaveTextContent('残り4試合');
    expect(screen.getByRole('button', { name: courtHeadingName(2) })).toHaveTextContent(
      'すべて終了'
    );
  });

  test('終わった試合は最初は隠れていて、「✓ 終了した◯試合を見る」を押すと出る', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));

    expect(screen.queryByTestId('match-row-c1-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '✓ 終了した2試合を見る' }));
    expect(screen.getByTestId('match-row-c1-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✓ 終了した2試合を隠す' })).toBeInTheDocument();
  });

  test('進行中の行を押しても何も起きない（得点入力は出ない）', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));

    fireEvent.click(screen.getByTestId('match-row-c1-3'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /＋1|−1|閉じる/ })).not.toBeInTheDocument();
  });

  test('「入れた点はまだ保存されません」の帯は出ない', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));

    expect(screen.queryByText(/まだ保存されません/)).not.toBeInTheDocument();
  });

  describe('選手として入った人', () => {
    test('「全試合」「自分の試合」が出る', () => {
      renderPage({ canFilterMine: true });

      expect(screen.getByRole('button', { name: '全試合' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '自分の試合' })).toBeInTheDocument();
    });

    test('「自分の試合」で、自分の出る試合を含むコートだけになる', () => {
      renderPage({
        board: [
          ...court1Matches(),
          boardMatch({ matchId: 'c2-1', courtNumber: 2, orderInCourt: 1, status: 'waiting' }),
        ],
      });

      expect(screen.getByRole('button', { name: courtHeadingName(2) })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));

      expect(screen.queryByRole('button', { name: courtHeadingName(2) })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: courtHeadingName(1) })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '全試合' }));
      expect(screen.getByRole('button', { name: courtHeadingName(2) })).toBeInTheDocument();
    });

    test('「自分の試合」で、コートの中も自分の試合だけが並ぶ', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));
      fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));
      fireEvent.click(screen.getByRole('button', { name: '✓ 終了した1試合を見る' }));

      expect(screen.getByTestId('match-row-c1-2')).toBeInTheDocument();
      expect(screen.queryByTestId('match-row-c1-3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('match-row-c1-4')).not.toBeInTheDocument();
    });

    test('「自分の試合」で絞っても、見出しはコート全体の状態を出す', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));

      // 自分の試合は終わった c1-2 だけ。コート自体はまだ進行中なので「すべて終了」にしない。
      const heading = screen.getByRole('button', { name: courtHeadingName(1) });
      expect(heading).toHaveTextContent('現在3試合目');
      expect(heading).toHaveTextContent('残り4試合');
      expect(heading).not.toHaveTextContent('すべて終了');
    });

    test('自分の試合には「あなたの試合」の印が出る', () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));
      fireEvent.click(screen.getByRole('button', { name: '✓ 終了した2試合を見る' }));

      expect(screen.getByTestId('match-row-c1-2')).toHaveTextContent('あなたの試合');
      expect(screen.getByTestId('match-row-c1-1')).not.toHaveTextContent('あなたの試合');
    });

    test('自分の試合が 1 つも無いときは、空のまま黙らず案内を出す', () => {
      renderPage({ board: [boardMatch({ matchId: 'x', isMine: false })] });

      fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));

      expect(screen.getByText('あなたの試合は見つかりませんでした')).toBeInTheDocument();
    });
  });

  describe('観戦者', () => {
    test('「全試合」だけが出て、「自分の試合」は出ない', () => {
      renderPage({ canFilterMine: false });

      expect(screen.getByRole('button', { name: '全試合' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '自分の試合' })).not.toBeInTheDocument();
    });

    test('「あなたの試合」の印は出ない', () => {
      // 観戦者の読み込みでは isMine は付かない（build-matches-view.test.ts）
      renderPage({
        canFilterMine: false,
        board: [boardMatch({ matchId: 'a', isMine: false })],
      });
      fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));

      expect(screen.queryByText('あなたの試合')).not.toBeInTheDocument();
    });
  });

  test('試合が 1 つも無いときは「まだ試合が登録されていません」と出る', () => {
    renderPage({ board: [] });

    expect(screen.getByText('まだ試合が登録されていません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^コート/ })).not.toBeInTheDocument();
  });

  test('読む上限を超えたときは、出しきれていないかもしれないと知らせる', () => {
    renderPage({ truncated: true });

    expect(screen.getByRole('alert')).toHaveTextContent('出しきれていない');
  });

  test('上限を超えていなければ、その知らせは出ない', () => {
    renderPage({ truncated: false });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
