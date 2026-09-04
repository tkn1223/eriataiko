import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { FinishConfirmSheet } from '@/ui/courts/finish-confirm-sheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof FinishConfirmSheet>> = {}) {
  const onOk = vi.fn();
  const onClose = vi.fn();

  const utils = render(
    <FinishConfirmSheet
      open
      gameNumber={2}
      teamAName="佐々木・井上"
      teamBName="田中・木村"
      gameScore={[21, 19]}
      winnerName="佐々木・井上"
      matchFinished={false}
      matchWinnerName={null}
      matchWinnerScoreText={null}
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

  test('ゲームだけ終わるときは見出しが「第2ゲームを終了します」になる', () => {
    renderSheet();

    expect(screen.getByText('第2ゲームを終了します')).toBeInTheDocument();
  });

  test('試合も終わるときは見出しが「この試合を終了します」になる', () => {
    renderSheet({
      matchFinished: true,
      matchWinnerName: '佐々木・井上',
      matchWinnerScoreText: '2-0',
    });

    expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
    expect(screen.queryByText('第2ゲームを終了します')).not.toBeInTheDocument();
  });

  test('得点とペア名が「佐々木・井上 21 - 19 田中・木村」の形で出る', () => {
    renderSheet();

    expect(screen.getByText('21 - 19', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('田中・木村', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('佐々木・井上', { exact: false }).length).toBeGreaterThan(0);
  });

  test('「このゲームの勝ち: 佐々木・井上」が出る', () => {
    renderSheet();

    expect(screen.getByText(/このゲームの勝ち/)).toBeInTheDocument();
  });

  test('試合も終わるときだけ「試合の勝ち: 佐々木・井上（2-0）」が出る', () => {
    renderSheet({
      matchFinished: true,
      matchWinnerName: '佐々木・井上',
      matchWinnerScoreText: '2-0',
    });

    expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
    expect(screen.getByText(/2-0/)).toBeInTheDocument();
  });

  test('ゲームだけ終わるときは「試合の勝ち」が出ない', () => {
    renderSheet();

    expect(screen.queryByText(/試合の勝ち/)).not.toBeInTheDocument();
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
