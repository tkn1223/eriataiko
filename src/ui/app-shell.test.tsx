import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AppShell } from '@/ui/app-shell';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/courts') }));

describe('AppShell', () => {
  test('渡された大会名が見出しとして出る', () => {
    render(<AppShell title="えりあ太鼓カップ 2027">中身</AppShell>);

    expect(screen.getByRole('heading', { name: 'えりあ太鼓カップ 2027' })).toBeInTheDocument();
  });

  test('大会名は渡されたものをそのまま出す（画面側で決め打ちしない）', () => {
    render(<AppShell title="べつの大会 2028">中身</AppShell>);

    expect(screen.getByRole('heading', { name: 'べつの大会 2028' })).toBeInTheDocument();
    expect(screen.queryByText('バドミントン大会 進行管理')).not.toBeInTheDocument();
  });

  test('上の帯は黒地で、白い印（SVG）と大会名が並ぶ。画面が一言を渡さなければ、大会名だけ', () => {
    render(<AppShell title="えりあ太鼓カップ 2027">中身</AppShell>);

    const bar = screen.getByRole('banner');
    expect(bar).toHaveClass('app-bar');
    expect(bar.querySelector('svg')).not.toBeNull();
    expect(bar).toHaveTextContent(/^えりあ太鼓カップ 2027$/);
  });
});
