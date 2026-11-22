import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { MatchesPage } from '@/ui/matches/matches-page';
import { boardMatch } from '@/ui/matches/test-support';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 画面は読み直し（router.refresh）と、他の人の変化の受け取り（試合速報と共有の
 * use-live-updates.ts）を使う。この中は表示の確認だけなので、どちらも何もしない偽物にする
 * （受け取りと読み直しの確認は matches-live.test.tsx）。
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/courts/use-live-updates', () => ({ useLiveUpdates: () => 'live' }));

/**
 * 進行表の画面（1a 全コート・1b コートの全試合・1c 探す）。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const aoizora = {
  teamNumber: 1,
  teamName: 'あおぞら',
  players: ['ハルキ', 'ミドリ'],
  slotLabel: null,
};
const umikaze = { teamNumber: 4, teamName: 'うみかぜ', players: ['トモ', 'リコ'], slotLabel: null };
const morino = { teamNumber: 2, teamName: 'もりの', players: ['ケイ', 'ユイ'], slotLabel: null };
const sakura = { teamNumber: 3, teamName: 'さくら', players: ['シン', 'ヒナ'], slotLabel: null };

/** コート 1: 終了 2・試合中 1・これから 2。コート 2: 試合中 1・これから 1。 */
function sampleBoard(): BoardMatch[] {
  return [
    boardMatch({
      matchId: 'c1-1',
      orderInCourt: 1,
      status: 'done',
      teamA: aoizora,
      teamB: morino,
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
    }),
    boardMatch({
      matchId: 'c1-2',
      orderInCourt: 2,
      status: 'done',
      teamA: aoizora,
      teamB: sakura,
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 8 }],
    }),
    boardMatch({
      matchId: 'c1-3',
      orderInCourt: 3,
      status: 'live',
      teamA: aoizora,
      teamB: umikaze,
      scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
    }),
    boardMatch({
      matchId: 'c1-4',
      orderInCourt: 4,
      status: 'waiting',
      teamA: morino,
      teamB: sakura,
    }),
    boardMatch({
      matchId: 'c1-5',
      orderInCourt: 5,
      status: 'waiting',
      teamA: morino,
      teamB: umikaze,
    }),
    boardMatch({
      matchId: 'c2-1',
      courtNumber: 2,
      orderInCourt: 1,
      status: 'live',
      teamA: { ...sakura, players: ['ソウタ', 'アカネ'] },
      teamB: { ...umikaze, players: ['カイ', 'ノア'] },
      scores: [{ gameNumber: 1, sideAScore: 17, sideBScore: 20 }],
    }),
    boardMatch({
      matchId: 'c2-2',
      courtNumber: 2,
      orderInCourt: 2,
      status: 'waiting',
      teamA: morino,
      teamB: sakura,
    }),
  ];
}

function renderPage(props: Partial<React.ComponentProps<typeof MatchesPage>> = {}) {
  return render(
    <MatchesPage
      board={sampleBoard()}
      truncated={false}
      initialCourt={null}
      stageLabel="予選リーグ"
      completedMatches={27}
      totalMatches={72}
      {...props}
    />
  );
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('1a 全コート', () => {
  test('開いた直後、何も押さずに全コートのいまの試合（両方の名前・点）と次の試合が見える', () => {
    renderPage();

    const court1 = screen.getByTestId('matches-court-card-1');
    expect(within(court1).getByText('ハルキ・ミドリ')).toBeInTheDocument();
    expect(within(court1).getByText('トモ・リコ')).toBeInTheDocument();
    expect(within(court1).getByText('12')).toBeInTheDocument();
    expect(within(court1).getByText('ケイ・ユイ vs シン・ヒナ')).toBeInTheDocument();

    const court2 = screen.getByTestId('matches-court-card-2');
    expect(within(court2).getByText('ソウタ・アカネ')).toBeInTheDocument();
    expect(within(court2).getByText('カイ・ノア')).toBeInTheDocument();
    expect(within(court2).getByText('20')).toBeInTheDocument();
  });

  test('ページ見出し「進行表」は本文に出さない（帯とメニューにあるため）', () => {
    renderPage();

    expect(screen.queryByRole('heading', { name: '進行表' })).not.toBeInTheDocument();
  });

  test('「全試合｜自分の試合」の切り替えは無い', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: '自分の試合' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '全試合' })).not.toBeInTheDocument();
  });

  test('コートのカードは試合のあるコートだけ、番号順に出る（9・10 番も、飛び番号もそのまま）', () => {
    renderPage({
      board: [
        boardMatch({ matchId: 'a', courtNumber: 10 }),
        boardMatch({ matchId: 'b', courtNumber: 2 }),
        boardMatch({ matchId: 'c', courtNumber: 9 }),
      ],
    });

    const cards = screen.getAllByTestId(/^matches-court-card-/).map((card) => card.id);
    expect(cards).toEqual(['matches-court-2', 'matches-court-9', 'matches-court-10']);
  });

  test('コートが決まっていない試合は、最後に「コート未定」としてまとまる', () => {
    renderPage({
      board: [
        boardMatch({ matchId: 'u', courtNumber: null, orderInCourt: null }),
        boardMatch({ matchId: 'a', courtNumber: 3 }),
      ],
    });

    expect(screen.getByTestId('matches-court-card-3')).toBeInTheDocument();
    const undecided = screen.getByTestId('matches-undecided');
    expect(undecided).toHaveTextContent('コート未定');
    expect(within(undecided).getByTestId('match-row-u')).toBeInTheDocument();
  });

  test('コート札を押すと、そのコートのカードへ移る（スクロール）', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^コート2 \S+$/ }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('matches-court-2'));
  });

  test('コート札の数はコートの数と同じ', () => {
    renderPage();

    const chips = screen.getAllByRole('button', {
      name: /^コート\d (試合中|呼出待ち|全試合終了)$/,
    });
    expect(chips).toHaveLength(2);
  });

  test('試合が 1 つも無いときは、日本語の案内が出る', () => {
    renderPage({ board: [] });

    expect(screen.getByTestId('matches-empty-notice')).toHaveTextContent(
      'まだ試合が登録されていません'
    );
  });

  test('読む上限を超えたときは、出しきれていないかもしれないと知らせる', () => {
    renderPage({ truncated: true });

    expect(screen.getByRole('alert')).toHaveTextContent('出しきれていない');
  });
});

describe('1b コートの全試合', () => {
  test('カードを押すと、そのコートの全試合が出る。終わった試合も隠れていない', () => {
    renderPage();

    fireEvent.click(within(screen.getByTestId('matches-court-card-1')).getByRole('button'));

    expect(screen.getByTestId('court-matches')).toBeInTheDocument();
    expect(screen.getByTestId('match-row-c1-1')).toBeInTheDocument();
    expect(screen.getByTestId('match-row-c1-2')).toBeInTheDocument();
    expect(screen.getByTestId('match-row-c1-5')).toBeInTheDocument();
    expect(screen.queryByTestId('match-row-c2-1')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?court=1');
  });

  test('URL に ?court=N があれば、最初からそのコートの全試合が開く', () => {
    renderPage({ initialCourt: 2 });

    expect(screen.getByTestId('match-row-c2-2')).toBeInTheDocument();
    expect(screen.queryByTestId('match-row-c1-1')).not.toBeInTheDocument();
  });

  test('存在しないコート番号なら、全コートの画面にする', () => {
    renderPage({ initialCourt: 7 });

    expect(screen.getByTestId('matches-court-card-1')).toBeInTheDocument();
  });

  test('札で隣のコートへ移れる。開いているコートの札には現在地の印が付く', () => {
    renderPage({ initialCourt: 1 });

    expect(screen.getByRole('button', { name: /^コート1/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: /^コート2/ }));

    expect(screen.getByTestId('match-row-c2-2')).toBeInTheDocument();
    expect(window.location.search).toBe('?court=2');
  });

  test('「‹ 全コート」を押すと全コートの画面に戻る', () => {
    renderPage({ initialCourt: 1 });

    fireEvent.click(screen.getByRole('button', { name: /全コート/ }));

    expect(screen.getByTestId('matches-court-card-2')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });
});

describe('1c 探す', () => {
  test('探す欄に名前の一部を入れると、その試合が試合中 → これから → 終わった試合の順に出る', () => {
    renderPage();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ハルキ' } });

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['試合中', '終わった試合 ・ 2勝0敗']);
    expect(screen.getByTestId('match-row-c1-3')).toBeInTheDocument();
    expect(screen.getByTestId('match-row-c1-1')).toBeInTheDocument();
    expect(screen.queryByTestId('match-row-c2-1')).not.toBeInTheDocument();
  });

  test('チーム名でも探せて、これからの試合が出る。行の上にコートが出る', () => {
    renderPage();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'もりの' } });

    expect(screen.getByRole('heading', { name: 'これから' })).toBeInTheDocument();
    const row = screen.getByTestId('match-row-c2-2');
    expect(within(row).getByText('コート2')).toBeInTheDocument();
  });

  test('当たる試合が無いときは、日本語でそう出る', () => {
    renderPage();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ぜんぜん違う' } });

    expect(screen.getByText('当てはまる試合は見つかりませんでした')).toBeInTheDocument();
  });

  test('「やめる」を押すと探す前の画面（全コート）に戻る', () => {
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ハルキ' } });

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));

    expect(screen.getByTestId('matches-court-card-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'やめる' })).not.toBeInTheDocument();
  });

  test('結果の行はどれも押すと詳しい画面へ移る', () => {
    renderPage();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ハルキ' } });

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/matches\/c1-\d$/);
    }
  });
});

describe('どの行・カードからも詳しい画面へ', () => {
  test('1b の行は詳しい画面へのリンクになっている', () => {
    renderPage({ initialCourt: 1 });

    expect(within(screen.getByTestId('match-row-c1-4')).getByRole('link')).toHaveAttribute(
      'href',
      '/matches/c1-4'
    );
  });
});
