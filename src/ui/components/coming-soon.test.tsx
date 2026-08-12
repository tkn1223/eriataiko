import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ComingSoon } from '@/ui/components/coming-soon';

describe('ComingSoon', () => {
  test('見出しと説明が出る', () => {
    render(<ComingSoon title="順位表" description="勝敗で順位を出す画面。" />);
    expect(screen.getByText('順位表')).toBeInTheDocument();
    expect(screen.getByText('準備中')).toBeInTheDocument();
    expect(screen.getByText('勝敗で順位を出す画面。')).toBeInTheDocument();
  });
});
