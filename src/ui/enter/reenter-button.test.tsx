import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ReenterButton } from '@/ui/enter/reenter-button';
import { appScoreSyncStore } from '@/ui/courts/use-score-sync';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('入り直すボタン', () => {
  test('渡した文言のボタンが出る', () => {
    render(<ReenterButton label="別の人として入り直す" />);

    expect(screen.getByRole('button', { name: '別の人として入り直す' })).toBeInTheDocument();
  });

  test('押すと退場して、チームを選ぶ最初の画面（/enter）へ移る', async () => {
    render(<ReenterButton label="別の人として入り直す" />);
    fireEvent.click(screen.getByRole('button', { name: '別の人として入り直す' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/enter'));
    expect(fetchMock).toHaveBeenCalledWith('/api/session', { method: 'DELETE' });
  });

  test('退場できたら、入場者がいなくなった（null）と預かり場所に知らせる', async () => {
    const begin = vi.spyOn(appScoreSyncStore, 'beginEntrantChange');
    const end = vi.spyOn(appScoreSyncStore, 'endEntrantChange');
    render(<ReenterButton label="別の人として入り直す" />);
    fireEvent.click(screen.getByRole('button', { name: '別の人として入り直す' }));

    expect(begin).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(end).toHaveBeenCalledWith(null));
  });

  test('つながらなかったら、理由を出して画面は移らない（前の入場者のまま）', async () => {
    const end = vi.spyOn(appScoreSyncStore, 'endEntrantChange');
    const cancel = vi.spyOn(appScoreSyncStore, 'cancelEntrantChange');
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('network down');
    });
    render(<ReenterButton label="別の人として入り直す" />);
    fireEvent.click(screen.getByRole('button', { name: '別の人として入り直す' }));

    await waitFor(() =>
      expect(screen.getByText(/ネットワークに繋がりませんでした/)).toBeInTheDocument()
    );
    expect(push).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  test('断られたら、その理由を出して画面は移らない', async () => {
    fetchMock.mockImplementationOnce(
      async () => new Response(JSON.stringify({ error: '退場できませんでした。' }), { status: 500 })
    );
    render(<ReenterButton label="別の人として入り直す" />);
    fireEvent.click(screen.getByRole('button', { name: '別の人として入り直す' }));

    await waitFor(() => expect(screen.getByText('退場できませんでした。')).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });
});
