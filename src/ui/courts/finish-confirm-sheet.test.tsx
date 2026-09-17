import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { FinishConfirmSheet } from '@/ui/courts/finish-confirm-sheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof FinishConfirmSheet>> = {}) {
  const onOk = vi.fn();
  const onClose = vi.fn();

  const utils = render(
    <FinishConfirmSheet
      open
      games={[
        { gameNumber: 1, sideAScore: 21, sideBScore: 19, winnerLabel: '佐々木・井上' },
        { gameNumber: 2, sideAScore: 15, sideBScore: 21, winnerLabel: '田中・木村' },
        { gameNumber: 3, sideAScore: 21, sideBScore: 18, winnerLabel: '佐々木・井上' },
      ]}
      matchWinnerName="佐々木・井上"
      matchWinnerScoreText="2-1"
      onOk={onOk}
      onClose={onClose}
      {...overrides}
    />
  );

  return { ...utils, onOk, onClose };
}

describe('FinishConfirmSheet', () => {
  test('open が false のときは何も出ない', () => {
    renderSheet({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('見出しは常に「この試合を終了します」', () => {
    renderSheet();

    expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
  });

  test('各ゲームの得点と勝ちペアが出る', () => {
    renderSheet();

    expect(screen.getByText('第1ゲーム', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('21 - 19', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('第2ゲーム', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('15 - 21', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('第3ゲーム', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('21 - 18', { exact: false })).toBeInTheDocument();
  });

  test('引き分けのゲームは「引き分け」と出る', () => {
    renderSheet({
      games: [{ gameNumber: 1, sideAScore: 15, sideBScore: 15, winnerLabel: '引き分け' }],
    });

    expect(screen.getByText(/引き分け/)).toBeInTheDocument();
  });

  test('「試合の勝ち: 佐々木・井上（2-1）」が出る', () => {
    renderSheet();

    expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
    expect(screen.getAllByText('佐々木・井上', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/2-1/)).toBeInTheDocument();
  });

  test('「OK」と「戻る」ボタンが両方出る', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument();
  });

  test('「OK」を押すとonOkが呼ばれる', () => {
    const { onOk } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalled();
  });

  test('「戻る」を押すとonCloseが呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('背景を押すとonCloseが呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: '背景' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Escキーを押すとonCloseが呼ばれる', () => {
    const { onClose } = renderSheet();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
