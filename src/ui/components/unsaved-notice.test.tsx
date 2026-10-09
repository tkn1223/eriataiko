import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { UnsavedNotice } from '@/ui/components/unsaved-notice';

describe('UnsavedNotice', () => {
  test('進行表が使う文言が出る（進行表の文言は変えない）', () => {
    render(<UnsavedNotice />);

    expect(
      screen.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toBeInTheDocument();
  });
});
