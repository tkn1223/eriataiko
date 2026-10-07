import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ViewerNotice } from '@/ui/me/viewer-notice';

describe('ViewerNotice', () => {
  test('「観戦モード」と、名前を登録すれば見られるという案内が出る', () => {
    render(<ViewerNotice />);

    expect(screen.getByText('観戦モード')).toBeInTheDocument();
    expect(screen.getByText(/名前を登録すると.*自分の試合.*が見られます/)).toBeInTheDocument();
  });

  test('灰色の丸アバターに「観」と出る', () => {
    render(<ViewerNotice />);

    expect(screen.getByText('観')).toBeInTheDocument();
  });

  test('「選手として入り直す」は /enter へのリンクになっている', () => {
    render(<ViewerNotice />);

    const link = screen.getByRole('link', { name: '選手として入り直す' });
    expect(link).toHaveAttribute('href', '/enter');
  });

  test('成績や試合一覧は出ない', () => {
    render(<ViewerNotice />);

    expect(screen.queryByText('今大会の試合')).not.toBeInTheDocument();
  });
});
