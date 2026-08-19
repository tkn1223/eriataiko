import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ScoreSheet } from '@/ui/matches/score-sheet';
import type { CourtMatch } from '@/ui/matches/sample-data';

const match: CourtMatch & { courtNumber: number } = {
  id: 'm-live',
  courtNumber: 3,
  orderInCourt: 2,
  classLabel: '2部',
  roundLabel: '予選 1回戦',
  status: 'live',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  finishedGames: [[21, 15]],
  currentGame: [10, 8],
};

function renderSheet(overrides: Partial<React.ComponentProps<typeof ScoreSheet>> = {}) {
  const onIncrement = vi.fn();
  const onDecrement = vi.fn();
  const onFinishGame = vi.fn();
  const onClose = vi.fn();

  const utils = render(
    <ScoreSheet
      match={match}
      sessionGames={[]}
      currentGame={[10, 8]}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onFinishGame={onFinishGame}
      onClose={onClose}
      {...overrides}
    />
  );

  return { ...utils, onIncrement, onDecrement, onFinishGame, onClose };
}

describe('ScoreSheet', () => {
  test('match が null のときは何も出ない', () => {
    render(
      <ScoreSheet
        match={null}
        sessionGames={[]}
        currentGame={[0, 0]}
        onIncrement={() => {}}
        onDecrement={() => {}}
        onFinishGame={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('見出しに「コート3 ・ [2部] 予選 1回戦」と「2ゲーム目」が出る', () => {
    renderSheet();

    expect(screen.getByText('コート3 ・ [2部] 予選 1回戦')).toBeInTheDocument();
    expect(screen.getByText('2ゲーム目')).toBeInTheDocument();
  });

  test('得点入力に「まだ保存されません」の注意書きが出る', () => {
    renderSheet();

    expect(
      screen.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toBeInTheDocument();
  });

  test('両ペアの名前と、現在の得点が出る', () => {
    renderSheet();

    expect(screen.getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(screen.getByText('高橋・伊藤')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  test('終わったゲームは「第1ゲーム 21-15」のチップで出る', () => {
    renderSheet();

    expect(screen.getByText('第1ゲーム 21-15')).toBeInTheDocument();
  });

  test('「＋1」を押すと onIncrement が呼ばれる', () => {
    const { onIncrement } = renderSheet();

    fireEvent.click(screen.getAllByRole('button', { name: '＋1' })[0]);
    expect(onIncrement).toHaveBeenCalledWith('A');
  });

  test('「−1」を押すと onDecrement が呼ばれる', () => {
    const { onDecrement } = renderSheet();

    fireEvent.click(screen.getAllByRole('button', { name: '−1' })[1]);
    expect(onDecrement).toHaveBeenCalledWith('B');
  });

  test('「ゲーム終了」を押すと onFinishGame が呼ばれる', () => {
    const { onFinishGame } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));
    expect(onFinishGame).toHaveBeenCalled();
  });

  test('「閉じる」を押すと onClose が呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(onClose).toHaveBeenCalled();
  });

  test('背景の暗い部分を押すと onClose が呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: '背景' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Esc キーを押すと onClose が呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
