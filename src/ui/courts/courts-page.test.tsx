import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourtsPage } from '@/ui/courts/courts-page';
import { sampleCourts } from '@/ui/courts/sample-data';

function renderPage() {
  return render(<CourtsPage courts={sampleCourts} completedMatches={2} totalMatches={48} />);
}

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

    // コート1 は佐々木・井上（A）15点 / 田中・木村（B）12点 から始まる
    expect(within(card).getByText('15')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));
    expect(within(card).getByText('16')).toBeInTheDocument();
  });

  test('「−」を押すと得点が1減る', () => {
    renderPage();
    const card = screen.getByTestId('court-card-1');

    expect(within(card).getByText('12')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '田中・木村の得点を1減らす' }));
    expect(within(card).getByText('11')).toBeInTheDocument();
  });

  test('「−」を押しても0より下にはならない', () => {
    renderPage();
    const card = screen.getByTestId('court-card-6');

    // コート6 は 長谷川・村上（A）5点 から始まる
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(within(card).getByRole('button', { name: '長谷川・村上の得点を1減らす' }));
    }
    expect(within(card).getByText('0')).toBeInTheDocument();
  });

  test('コートごとに得点の増減が独立している（他のコートに影響しない）', () => {
    renderPage();
    const card1 = screen.getByTestId('court-card-1');
    const card2 = screen.getByTestId('court-card-2');

    fireEvent.click(within(card1).getByRole('button', { name: '佐々木・井上の得点を1増やす' }));

    expect(within(card1).getByText('16')).toBeInTheDocument();
    // コート2 は 山田・中川（A）20点のまま変わらない
    expect(within(card2).getByText('20')).toBeInTheDocument();
  });

  test('「ゲーム終了」を押すと、いまの得点がチップになり、次のゲーム（0-0）が始まる', () => {
    renderPage();
    const card = screen.getByTestId('court-card-3');

    // コート3 は自分の試合。鈴木・高橋（A）14点 / 伊藤・渡辺（B）11点、1ゲーム目、終わったゲームは無い
    expect(within(card).getByText('予選 2回戦・1ゲーム目')).toBeInTheDocument();
    expect(within(card).queryByText(/第\d+ゲーム/)).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'ゲーム終了' }));

    expect(within(card).getByText('第1ゲーム 14-11')).toBeInTheDocument();
    expect(within(card).getByText('予選 2回戦・2ゲーム目')).toBeInTheDocument();
    expect(within(card).getAllByText('0')).toHaveLength(2);
  });
});
