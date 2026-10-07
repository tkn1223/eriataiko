import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ConnectionErrorBlock } from '@/ui/components/connection-error-block';
import { ErrorBlock } from '@/ui/components/error-block';

describe('ErrorBlock', () => {
  test('呼び出し側が渡した見出しと本文が出る', () => {
    render(
      <ErrorBlock heading="大会の情報が見つかりません" message="運営の方に確認してください。" />
    );

    expect(screen.getByText('大会の情報が見つかりません')).toBeInTheDocument();
    expect(screen.getByText('運営の方に確認してください。')).toBeInTheDocument();
  });

  test('見つからないときのエラーには .env や npm run の案内が出ない', () => {
    render(
      <ErrorBlock heading="大会の情報が見つかりません" message="運営の方に確認してください。" />
    );

    expect(screen.queryByText(/\.env\.local/)).not.toBeInTheDocument();
    expect(screen.queryByText(/npm run/)).not.toBeInTheDocument();
  });

  test('本当につながらないときは、開発者向けの見出しと .env / npm run の案内が出る', () => {
    render(<ConnectionErrorBlock message="接続に失敗しました" />);

    expect(screen.getByText('Supabase に繋がりません')).toBeInTheDocument();
    expect(screen.getByText('接続に失敗しました')).toBeInTheDocument();
    expect(screen.getByText(/\.env\.local/)).toBeInTheDocument();
    expect(screen.getByText(/npm run db:push/)).toBeInTheDocument();
  });
});
