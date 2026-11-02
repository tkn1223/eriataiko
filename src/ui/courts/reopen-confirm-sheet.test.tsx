import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ReopenConfirmSheet } from '@/ui/courts/reopen-confirm-sheet';

function renderSheet(open = true) {
  const onOk = vi.fn();
  const onClose = vi.fn();
  render(
    <ReopenConfirmSheet
      open={open}
      games={[
        { gameNumber: 1, sideAScore: 21, sideBScore: 19, winnerLabel: '佐々木・井上' },
        { gameNumber: 2, sideAScore: 15, sideBScore: 21, winnerLabel: '田中・木村' },
      ]}
      teamAName="佐々木・井上"
      teamBName="田中・木村"
      onOk={onOk}
      onClose={onClose}
    />
  );
  return { onOk, onClose };
}

describe('ReopenConfirmSheet', () => {
  test('open が false のときは何も出ない', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('どの試合を直すのか（ペア名とゲームごとの得点）が出る', () => {
    renderSheet();

    expect(screen.getByText('この試合を直します')).toBeInTheDocument();
    expect(screen.getByText('佐々木・井上')).toBeInTheDocument();
    expect(screen.getByText('田中・木村')).toBeInTheDocument();
    expect(screen.getByText('21 - 19')).toBeInTheDocument();
    expect(screen.getByText('15 - 21')).toBeInTheDocument();
  });

  test('何が起きるかを平易な日本語で伝える', () => {
    renderSheet();

    expect(screen.getByText(/終了をいったん取り消して/)).toBeInTheDocument();
  });

  test('「OK」で onOk、「戻る」で onClose が呼ばれる', () => {
    const { onOk, onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
