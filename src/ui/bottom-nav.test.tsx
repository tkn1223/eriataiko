import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { BottomNav } from '@/ui/bottom-nav';

const mockPathname = vi.hoisted(() => vi.fn(() => '/courts'));
vi.mock('next/navigation', () => ({ usePathname: mockPathname }));

describe('BottomNav', () => {
  test('4 つのメニューが並ぶ', () => {
    render(<BottomNav />);

    const labels = ['試合速報', '進行表', '対戦表', 'myページ'];
    for (const label of labels) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  test('「結果LIVE」の名前はメニューに残っていない（「試合速報」に変えた）', () => {
    render(<BottomNav />);

    expect(screen.queryByRole('link', { name: /結果LIVE/ })).not.toBeInTheDocument();
  });

  test('メニューと行き先が対応している', () => {
    render(<BottomNav />);

    expect(screen.getByRole('link', { name: /試合速報/ })).toHaveAttribute('href', '/courts');
    expect(screen.getByRole('link', { name: /進行表/ })).toHaveAttribute('href', '/matches');
    expect(screen.getByRole('link', { name: /対戦表/ })).toHaveAttribute('href', '/bracket');
    expect(screen.getByRole('link', { name: /myページ/ })).toHaveAttribute('href', '/me');
  });

  test('いま見ている画面のメニューだけ現在地として印が付く', () => {
    mockPathname.mockReturnValue('/bracket');
    render(<BottomNav />);

    expect(screen.getByRole('link', { name: /対戦表/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /試合速報/ })).not.toHaveAttribute('aria-current');
  });
});
