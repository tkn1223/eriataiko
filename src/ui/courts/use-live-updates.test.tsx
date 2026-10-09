import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import {
  createLiveHub,
  useLiveUpdates,
  type LiveClient,
  type LiveHubEvent,
} from '@/ui/courts/use-live-updates';

/**
 * 他の人の点や試合の変化を受け取る仕組み（Supabase の Realtime の購読）の確認。
 * 本物の接続は使わず、届き方を自分で作れる偽物のクライアントを渡す。
 */

type Binding = {
  event: string;
  table: string;
  callback: (payload: { new: unknown }) => void;
};

function createFakeClient() {
  const channels: Array<{
    name: string;
    bindings: Binding[];
    status: ((status: string) => void) | null;
  }> = [];
  const removeChannel = vi.fn();

  // 本物（realtime-js）と同じく、同じ名前の接続がまだ閉じきっていなければ（離れる知らせへの返事を
  // 待っている間は）、新しく作らずにその接続を返す。ここでは返事が来ないまま（閉じきらない）にしておく。
  const handles = new Map<string, ReturnType<LiveClient['channel']>>();
  const client: LiveClient = {
    channel(name) {
      const existing = handles.get(name);
      if (existing) return existing;
      const record: (typeof channels)[number] = { name, bindings: [], status: null };
      channels.push(record);
      const channel = {
        on(
          _type: 'postgres_changes',
          filter: { event: string; table: string },
          callback: Binding['callback']
        ) {
          record.bindings.push({ event: filter.event, table: filter.table, callback });
          return channel;
        },
        subscribe(callback: (status: string) => void) {
          record.status = callback;
          return channel;
        },
      };
      handles.set(name, channel);
      return channel;
    },
    removeChannel,
  };

  return {
    client,
    channels,
    removeChannel,
    /** その表のその種類の変化を届ける。 */
    deliver(table: string, event: string, row: unknown) {
      const binding = channels[0].bindings.find((b) => b.table === table && b.event === event);
      if (!binding) throw new Error(`${table} の ${event} は購読していない`);
      binding.callback({ new: row });
    },
    setStatus(status: string) {
      channels[0].status?.(status);
    },
  };
}

const MATCH_ROW = {
  id: 'm-1',
  status: 'done',
  court_number: 2,
  order_in_court: 3,
  finished_at: '2026-10-09T01:00:00+00:00',
  max_game_count: 3,
};

function collect(hub: ReturnType<typeof createLiveHub>) {
  const events: LiveHubEvent[] = [];
  const unsubscribe = hub.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

describe('createLiveHub', () => {
  test('試合の状態の変化と、得点の追加・更新を購読する（読むだけ）', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);

    collect(hub);

    const subscribed = fake.channels[0].bindings.map((b) => `${b.table}:${b.event}`).sort();
    expect(subscribed).toEqual(['game_scores:INSERT', 'game_scores:UPDATE', 'matches:UPDATE']);
  });

  test('届いた試合の行は、状態の変化として渡される', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.deliver('matches', 'UPDATE', MATCH_ROW);

    expect(events).toContainEqual({
      type: 'change',
      change: {
        kind: 'match',
        matchId: 'm-1',
        status: 'done',
        courtNumber: 2,
        orderInCourt: 3,
        finishedAt: '2026-10-09T01:00:00+00:00',
        maxGameCount: 3,
      },
    });
  });

  test('届いた得点の行は、点の変化として渡される', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.deliver('game_scores', 'INSERT', {
      match_id: 'm-1',
      game_number: 2,
      side_a_score: 5,
      side_b_score: 7,
    });

    expect(events).toContainEqual({
      type: 'change',
      change: { kind: 'score', matchId: 'm-1', gameNumber: 2, sideAScore: 5, sideBScore: 7 },
    });
  });

  test('読み取れない行は渡さない', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.deliver('matches', 'UPDATE', { id: 'm-1', status: 'unknown-status' });
    fake.deliver('game_scores', 'UPDATE', { match_id: 'm-1' });

    expect(events.filter((event) => event.type === 'change')).toEqual([]);
  });

  test('何人が使っても接続は 1 本。全員が離れたら止める', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);

    const first = collect(hub);
    const second = collect(hub);
    expect(fake.channels).toHaveLength(1);

    first.unsubscribe();
    expect(fake.removeChannel).not.toHaveBeenCalled();

    second.unsubscribe();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  // 結果LIVE を離れてすぐ戻ると、前の接続はまだ閉じている途中のことがある（電波が細いと数秒）。
  // 同じ名前で作り直すと、Supabase はその閉じかけの接続を返し、購読がつながらないまま
  // 「自動更新が止まっています」が出続ける。毎回別の名前で新しく作る。
  test('止めてすぐにまた使っても（前の接続が閉じきる前でも）、新しく接続する', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);

    collect(hub).unsubscribe();
    const { events } = collect(hub);

    expect(fake.channels).toHaveLength(2);
    expect(fake.channels[1].status).not.toBeNull();
    fake.channels[1].status?.('SUBSCRIBED');
    expect(events).toEqual([{ type: 'connection', state: 'live' }]);
  });

  test('止めたあとに届いた変化は渡さない', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    const { events, unsubscribe } = collect(hub);

    unsubscribe();
    fake.deliver('matches', 'UPDATE', MATCH_ROW);

    expect(events.filter((event) => event.type === 'change')).toEqual([]);
  });

  test('つながったら live、途切れたら down、つながり直したら live を伝える', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('SUBSCRIBED');
    fake.setStatus('CHANNEL_ERROR');
    fake.setStatus('SUBSCRIBED');

    expect(events).toEqual([
      { type: 'connection', state: 'live' },
      { type: 'connection', state: 'down' },
      { type: 'connection', state: 'live' },
    ]);
  });

  test('途切れの知らせが続いても、down は 1 回だけ伝える', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('SUBSCRIBED');
    fake.setStatus('TIMED_OUT');
    fake.setStatus('CLOSED');
    fake.setStatus('CHANNEL_ERROR');

    expect(
      events.filter((event) => event.type === 'connection' && event.state === 'down')
    ).toHaveLength(1);
  });

  test('一度もつながらないまま失敗したときも down。そのあとつながれば live', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('CHANNEL_ERROR');
    fake.setStatus('SUBSCRIBED');

    expect(events).toEqual([
      { type: 'connection', state: 'down' },
      { type: 'connection', state: 'live' },
    ]);
  });

  test('途中から使い始めた人には、いまの接続の状態がすぐ伝わる', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    collect(hub);
    fake.setStatus('SUBSCRIBED');

    const late = collect(hub);

    expect(late.events).toEqual([{ type: 'connection', state: 'live' }]);
  });
});

describe('useLiveUpdates', () => {
  test('変化を onChange に渡し、接続の状態を返す。外れたら購読を止める', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    const onChange = vi.fn();
    const onConnected = vi.fn();

    const { result, unmount } = renderHook(() => useLiveUpdates({ onChange, onConnected }, hub));
    expect(result.current).toBe('connecting');

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(result.current).toBe('live');

    act(() => fake.deliver('matches', 'UPDATE', MATCH_ROW));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'match', matchId: 'm-1' })
    );

    act(() => fake.setStatus('CHANNEL_ERROR'));
    expect(result.current).toBe('down');

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(result.current).toBe('live');

    unmount();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  // 購読は、つながる前に起きた変化を届けない。開いたときも、サーバーが読んでからつながるまでの
  // 変化（試合の終了・始まり）を取りこぼすので、最初につながったときも読み直す。
  test('開いて最初につながったときも、途切れてからつながり直したときも、onConnected を 1 回ずつ呼ぶ', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    const onConnected = vi.fn();
    renderHook(() => useLiveUpdates({ onChange: vi.fn(), onConnected }, hub));

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(onConnected).toHaveBeenCalledTimes(1);

    act(() => fake.setStatus('CHANNEL_ERROR'));
    act(() => fake.setStatus('TIMED_OUT'));
    expect(onConnected).toHaveBeenCalledTimes(1);

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(onConnected).toHaveBeenCalledTimes(2);
  });

  test('つながっている接続を途中から使い始めた画面も、onConnected を 1 回呼ぶ', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    renderHook(() => useLiveUpdates({ onChange: vi.fn(), onConnected: vi.fn() }, hub));
    act(() => fake.setStatus('SUBSCRIBED'));

    const onConnected = vi.fn();
    renderHook(() => useLiveUpdates({ onChange: vi.fn(), onConnected }, hub));

    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});
