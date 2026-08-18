import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { BottomSheet } from '@/ui/components/bottom-sheet';

function renderSheet(open = true) {
  const onClose = vi.fn();
  render(
    <BottomSheet
      open={open}
      labelledBy="sheet-title"
      onClose={onClose}
      header={<h2 id="sheet-title">見出し</h2>}
    >
      <p>中身</p>
    </BottomSheet>
  );
  return { onClose };
}

describe('BottomSheet', () => {
  test('open が false のときは何も出ない', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('open のときは見出しと中身が出る', () => {
    renderSheet();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('見出し')).toBeInTheDocument();
    expect(screen.getByText('中身')).toBeInTheDocument();
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

  test('閉じているときは Esc を押しても onClose が呼ばれない', () => {
    const { onClose } = renderSheet(false);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
