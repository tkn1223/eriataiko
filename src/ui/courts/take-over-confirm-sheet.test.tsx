import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { TakeOverConfirmSheet } from '@/ui/courts/take-over-confirm-sheet';

function renderSheet(open = true) {
  const onOk = vi.fn();
  const onClose = vi.fn();
  render(
    <TakeOverConfirmSheet open={open} scorerName="愛知北のじろう" onOk={onOk} onClose={onClose} />
  );
  return { onOk, onClose };
}

describe('TakeOverConfirmSheet', () => {
  test('open が false のときは何も出ない', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('いまの担当の名前（チーム名つき）を出して、引き継ぐかを聞く', () => {
    renderSheet();

    expect(
      screen.getByText('愛知北のじろうさんが入れています。引き継ぎますか？')
    ).toBeInTheDocument();
  });

  test('引き継ぐと何が起きるかを平易な日本語で伝える（前の人の ＋ は断られる・取り戻せる）', () => {
    renderSheet();

    expect(screen.getByText(/断られます/)).toBeInTheDocument();
    expect(screen.getByText(/もう一度引き継げます/)).toBeInTheDocument();
  });

  test('「OK」で onOk、「戻る」で onClose が呼ばれる', () => {
    const { onOk, onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('「OK」「戻る」は 44px 以上のボタン', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: 'OK' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: '戻る' })).toHaveClass('min-h-11');
  });
});
