import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ClassChip } from '@/ui/components/class-chip';

describe('ClassChip', () => {
  test('部の名前をそのまま文字に出す（1部/2部/3部に決め打ちしない）', () => {
    render(<ClassChip classLabel={{ name: '初級', colorNumber: 1 }} />);

    expect(screen.getByText('初級')).toBeInTheDocument();
  });

  test('色は色の番号で決まる。6 番目まで色が付く', () => {
    const { rerender } = render(<ClassChip classLabel={{ name: 'A', colorNumber: 4 }} />);
    expect(screen.getByText('A')).toHaveClass('text-class-4', 'bg-class-4-bg');

    rerender(<ClassChip classLabel={{ name: 'F', colorNumber: 6 }} />);
    expect(screen.getByText('F')).toHaveClass('text-class-6', 'bg-class-6-bg');
  });
});
