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

  test('進行表の下の画面（/matches/[matchId]・/matches/[matchId]/correct）でも「進行表」が現在地', () => {
    for (const path of ['/matches/abc', '/matches/abc/correct']) {
      mockPathname.mockReturnValue(path);
      const { unmount } = render(<BottomNav />);

      expect(screen.getByRole('link', { name: /進行表/ })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: /試合速報/ })).not.toHaveAttribute('aria-current');
      unmount();
    }
  });

  test('黒地で、開いている項目だけ金色。どの項目にも印（SVG）が付く', () => {
    mockPathname.mockReturnValue('/courts');
    render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: 'メインメニュー' })).toHaveClass('app-nav');
    expect(screen.getByRole('link', { name: /試合速報/ })).toHaveClass('app-nav-active');
    expect(screen.getByRole('link', { name: /進行表/ })).not.toHaveClass('app-nav-active');
    for (const link of screen.getAllByRole('link')) {
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });
});
