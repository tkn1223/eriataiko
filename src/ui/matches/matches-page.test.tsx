import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MatchesPage } from '@/ui/matches/matches-page';
import { sampleCourts } from '@/ui/matches/sample-data';

function renderPage() {
  return render(<MatchesPage courts={sampleCourts} />);
}

/** 見出しの文字列は区切りの空白を挟まず連結される（例: 「コート1現在3試合目残り4試合」）。
 *  「コート1」の直後に別の数字が続かないことだけを見て、他のコート番号と区別する。 */
function courtHeadingName(courtNumber: number) {
  return new RegExp(`^コート${courtNumber}(?!\\d)`);
}

/** コート1 を開いて、その中身が見える状態にする。 */
function openCourt1() {
  fireEvent.click(screen.getByRole('button', { name: courtHeadingName(1) }));
}

describe('MatchesPage', () => {
  test('見出し「進行表」が出る', () => {
    renderPage();
    expect(screen.getByText('進行表')).toBeInTheDocument();
  });

  test('「全試合」「自分の試合」の絞り込みが出る', () => {
    renderPage();

    expect(screen.getByRole('button', { name: '全試合' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '自分の試合' })).toBeInTheDocument();
  });

  test('コートごとのカードが8枚出る', () => {
    renderPage();

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      expect(
        screen.getByRole('button', { name: courtHeadingName(courtNumber) })
      ).toBeInTheDocument();
    }
  });

  test('見出しを押すと中身が開いたり閉じたりする', () => {
    renderPage();

    // c1-4 はこれからの試合。終了した試合と違い、最初から見える対象。
    expect(screen.queryByTestId('match-row-c1-4')).not.toBeInTheDocument();

    openCourt1();
    expect(screen.getByTestId('match-row-c1-4')).toBeInTheDocument();

    openCourt1();
    expect(screen.queryByTestId('match-row-c1-4')).not.toBeInTheDocument();
  });

  test('「自分の試合」を押すと、自分の試合を含むコートだけになる', () => {
    renderPage();

    // 絞り込み前は 8 コートとも見出しが出る
    expect(screen.getByRole('button', { name: courtHeadingName(8) })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));

    // コート8（予定なし）には自分の試合が無いので消える
    expect(screen.queryByRole('button', { name: courtHeadingName(8) })).not.toBeInTheDocument();
    // コート1（自分の試合 c1-2 を含む）は残る
    expect(screen.getByRole('button', { name: courtHeadingName(1) })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全試合' }));
    expect(screen.getByRole('button', { name: courtHeadingName(8) })).toBeInTheDocument();
  });

  test('「自分の試合」で絞っても、見出しはコート全体の状態を出す', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '自分の試合' }));

    // コート1 で自分の試合は終わった c1-2 だけ。コート自体はまだ進行中なので
    // 「すべて終了」ではなく、進行中と残りの数がそのまま出る。
    const heading = screen.getByRole('button', { name: courtHeadingName(1) });
    expect(heading).toHaveTextContent('現在3試合目');
    expect(heading).toHaveTextContent('残り4試合');
    expect(heading).not.toHaveTextContent('すべて終了');
  });

  test('進行中の行を押すと得点入力シートが下から出る', () => {
    renderPage();
    openCourt1();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // c1-3 は進行中の試合（中村 対 加藤）
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText('コート1 ・ [3部] 予選 2回戦')
    ).toBeInTheDocument();
  });

  test('「＋1」を押すと数字が1増え、「−1」で1減る。0より下にはならない', () => {
    renderPage();
    openCourt1();
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    // c1-3 の currentGame は [12, 9]
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('12')).toBeInTheDocument();
    expect(within(dialog).getByText('9')).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole('button', { name: '＋1' })[0]);
    expect(within(dialog).getByText('13')).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole('button', { name: '−1' })[0]);
    fireEvent.click(within(dialog).getAllByRole('button', { name: '−1' })[0]);
    // 12 -> 13 -> 12 -> 11
    expect(within(dialog).getByText('11')).toBeInTheDocument();

    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(within(dialog).getAllByRole('button', { name: '−1' })[1]);
    }
    expect(within(dialog).getByText('0')).toBeInTheDocument();
  });

  test('得点入力は「閉じる」で閉じる', () => {
    renderPage();
    openCourt1();
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('得点入力は「背景」で閉じる', () => {
    renderPage();
    openCourt1();
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    fireEvent.click(screen.getByRole('button', { name: '背景' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('得点入力は Esc で閉じる', () => {
    renderPage();
    openCourt1();
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('シートを閉じてもう一度開くと、入れた点は消えている', () => {
    renderPage();
    openCourt1();
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    fireEvent.click(screen.getAllByRole('button', { name: '＋1' })[0]);
    expect(screen.getByText('13')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    fireEvent.click(screen.getByRole('button', { name: '中村 対 加藤 の試合' }));

    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
