import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ViewerNotice } from '@/ui/me/viewer-notice';

// 「入り直す」ボタンが画面を移すのに使う。ここでは押したあとまでは見ない
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

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

  // 観戦をやめてから入場画面へ移る（押したあとの動きは src/ui/enter/reenter-button.test.tsx）
  test('「選手として入り直す」は、押すと観戦をやめるボタンになっている', () => {
    render(<ViewerNotice />);

    expect(screen.getByRole('button', { name: '選手として入り直す' })).toBeInTheDocument();
  });

  test('成績や試合一覧は出ない', () => {
    render(<ViewerNotice />);

    expect(screen.queryByText('今大会の試合')).not.toBeInTheDocument();
  });
});
