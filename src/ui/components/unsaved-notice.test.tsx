import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';

describe('UnsavedNotice', () => {
  test('文言を渡さなければ、今までどおりの既定の文言が出る（進行表はこのまま使う）', () => {
    render(<UnsavedNotice />);

    expect(
      screen.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toBeInTheDocument();
  });

  test('text を渡すと、その文言に差し替わる（結果LIVE が使う）', () => {
    render(<UnsavedNotice text="試合の終了はまだ記録されません（点は保存されます）" />);

    expect(
      screen.getByText('試合の終了はまだ記録されません（点は保存されます）')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).not.toBeInTheDocument();
  });
});
