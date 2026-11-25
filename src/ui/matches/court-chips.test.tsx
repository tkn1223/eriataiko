import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtChipStrip } from '@/ui/matches/court-chips';

/**
 * コート札の列。押すと 1a ではそのコートのカードへ、1b では隣のコートへ移る。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const courts = [
  { courtNumber: 1, status: 'live' as const },
  { courtNumber: 2, status: 'waiting' as const },
  { courtNumber: 3, status: 'finished' as const },
];

describe('CourtChipStrip', () => {
  test('コートの数だけ札が並び、番号で押せる', () => {
    const onSelect = vi.fn();
    render(<CourtChipStrip courts={courts} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /コート2/ }));

    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  test('札の名前に状態が入る（色だけに頼らない）', () => {
    render(<CourtChipStrip courts={courts} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'コート1 試合中' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'コート2 呼出中' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'コート3 全試合終了' })).toBeInTheDocument();
  });

  test('開いているコートの札は現在地の印が付き、先頭に「全コート」に戻る札が出る', () => {
    const onBack = vi.fn();
    render(<CourtChipStrip courts={courts} activeCourt={2} onSelect={vi.fn()} onBack={onBack} />);

    expect(screen.getByRole('button', { name: /コート2/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /コート1/ })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: /全コート/ }));
    expect(onBack).toHaveBeenCalled();
  });

  test('全コートの画面（onBack なし）には戻る札が出ない', () => {
    render(<CourtChipStrip courts={courts} onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /全コート/ })).not.toBeInTheDocument();
  });

  test('札は 44px 以上の幅と高さ（押しやすさ）', () => {
    render(<CourtChipStrip courts={courts} onSelect={vi.fn()} />);

    const chip = screen.getByRole('button', { name: /コート1/ });
    expect(chip.className).toMatch(/h-\[62px\]/);
    expect(chip.className).toMatch(/w-11/);
  });
});
