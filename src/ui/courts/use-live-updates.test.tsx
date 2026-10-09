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

  const client: LiveClient = {
    channel(name) {
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

  test('止めたあとにまた使えば、新しく接続する', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);

    collect(hub).unsubscribe();
    collect(hub);

    expect(fake.channels).toHaveLength(2);
  });

  test('止めたあとに届いた変化は渡さない', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    const { events, unsubscribe } = collect(hub);

    unsubscribe();
    fake.deliver('matches', 'UPDATE', MATCH_ROW);

    expect(events.filter((event) => event.type === 'change')).toEqual([]);
  });

  test('最初につながったときは、読み直す必要は無い（recovered ではない）', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('SUBSCRIBED');

    expect(events).toEqual([{ type: 'connection', state: 'live', recovered: false }]);
  });

  test('途切れたら down。つながり直したら recovered で知らせる', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('SUBSCRIBED');
    fake.setStatus('CHANNEL_ERROR');
    fake.setStatus('SUBSCRIBED');

    expect(events).toEqual([
      { type: 'connection', state: 'live', recovered: false },
      { type: 'connection', state: 'down', recovered: false },
      { type: 'connection', state: 'live', recovered: true },
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

  test('一度もつながらないまま失敗したときも down。そのあとつながれば recovered', () => {
    const fake = createFakeClient();
    const { events } = collect(createLiveHub(() => fake.client));

    fake.setStatus('CHANNEL_ERROR');
    fake.setStatus('SUBSCRIBED');

    expect(events).toEqual([
      { type: 'connection', state: 'down', recovered: false },
      { type: 'connection', state: 'live', recovered: true },
    ]);
  });

  test('途中から使い始めた人には、いまの接続の状態がすぐ伝わる', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    collect(hub);
    fake.setStatus('SUBSCRIBED');

    const late = collect(hub);

    expect(late.events).toEqual([{ type: 'connection', state: 'live', recovered: false }]);
  });
});

describe('useLiveUpdates', () => {
  test('変化を onChange に渡し、接続の状態を返す。外れたら購読を止める', () => {
    const fake = createFakeClient();
    const hub = createLiveHub(() => fake.client);
    const onChange = vi.fn();
    const onRecovered = vi.fn();

    const { result, unmount } = renderHook(() => useLiveUpdates({ onChange, onRecovered }, hub));
    expect(result.current).toBe('connecting');

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(result.current).toBe('live');

    act(() => fake.deliver('matches', 'UPDATE', MATCH_ROW));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'match', matchId: 'm-1' })
    );

    act(() => fake.setStatus('CHANNEL_ERROR'));
    expect(result.current).toBe('down');
    expect(onRecovered).not.toHaveBeenCalled();

    act(() => fake.setStatus('SUBSCRIBED'));
    expect(result.current).toBe('live');
    expect(onRecovered).toHaveBeenCalledTimes(1);

    unmount();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });
});
