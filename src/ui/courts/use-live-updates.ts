'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { getSupabaseBrowserClient } from '@/db/client';
import type { LiveChange } from '@/ui/courts/apply-live-change';
import type { CourtMatchStatus } from '@/ui/courts/types';

/**
 * 他の人の点や試合の状態の変化を受け取る（Supabase Realtime の購読）。
 *
 * **ブラウザの Supabase クライアントは「読む」と「購読する」だけに使う。**
 * 書き込みは Route Handler 経由（`use-score-sync.ts`）。ここからは何も書かない。
 *
 * 接続は**アプリ全体で 1 本**（`appLiveHub`）。結果LIVE の画面が何回開き直されても、
 * 画面が 2 つの部品から呼んでも、Supabase との接続は 1 本で、使う人が全員いなくなったら止める。
 * 100 人が同時に見るので、1 人が何本も繋ぐと同時接続の枠（無料プランは 200）を食い潰す。
 *
 * 届いた行は `LiveChange` に直して渡すだけで、画面にどう当てるかは `apply-live-change.ts`。
 *
 * 仕様: docs/specs/2026-10-09-courts-live-and-finish.md
 */

/** 接続の状態。'connecting' は開いた直後でまだつながっていない（案内は出さない）。 */
export type LiveConnection = 'connecting' | 'live' | 'down';

export type LiveHubEvent =
  | { type: 'change'; change: LiveChange }
  | {
      type: 'connection';
      state: LiveConnection;
      /**
       * 途切れていたのが、つながり直した。間に入った変化を取り戻すため、呼び出し側が 1 回だけ
       * 読み直す。開いて最初につながったときは false（サーバーが読んだばかりなので読み直さない）。
       */
      recovered: boolean;
    };

type Listener = (event: LiveHubEvent) => void;

/** Supabase のクライアントのうち、ここで使う部分だけ（テストで偽物に差し替えるため）。 */
export type LiveClient = {
  channel: (name: string) => LiveChannel;
  removeChannel: (channel: LiveChannel) => unknown;
};

type LiveChannel = {
  on: (
    type: 'postgres_changes',
    filter: { event: 'UPDATE' | 'INSERT'; schema: 'public'; table: 'matches' | 'game_scores' },
    callback: (payload: { new: unknown }) => void
  ) => LiveChannel;
  subscribe: (callback: (status: string) => void) => LiveChannel;
};

const MATCH_STATUSES: readonly string[] = ['waiting', 'live', 'done'] satisfies CourtMatchStatus[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === 'number' ? value : undefined;
}

/** `matches` の行を状態の変化に直す。読み取れない形なら null。 */
function toMatchChange(row: unknown): LiveChange | null {
  if (!isRecord(row)) return null;
  const { id, status, finished_at: finishedAt, max_game_count: maxGameCount } = row;
  const courtNumber = nullableNumber(row.court_number);
  const orderInCourt = nullableNumber(row.order_in_court);
  if (
    typeof id !== 'string' ||
    typeof status !== 'string' ||
    !MATCH_STATUSES.includes(status) ||
    courtNumber === undefined ||
    orderInCourt === undefined ||
    typeof maxGameCount !== 'number' ||
    !(finishedAt === null || typeof finishedAt === 'string')
  ) {
    return null;
  }
  return {
    kind: 'match',
    matchId: id,
    status: status as CourtMatchStatus,
    courtNumber,
    orderInCourt,
    finishedAt,
    maxGameCount,
  };
}

/** `game_scores` の行を点の変化に直す。読み取れない形なら null。 */
function toScoreChange(row: unknown): LiveChange | null {
  if (!isRecord(row)) return null;
  const { match_id: matchId, game_number: gameNumber } = row;
  const { side_a_score: sideAScore, side_b_score: sideBScore } = row;
  if (
    typeof matchId !== 'string' ||
    typeof gameNumber !== 'number' ||
    typeof sideAScore !== 'number' ||
    typeof sideBScore !== 'number'
  ) {
    return null;
  }
  return { kind: 'score', matchId, gameNumber, sideAScore, sideBScore };
}

export type LiveHub = {
  /** 変化と接続の状態を受け取る。戻り値で受け取りをやめる。最後の 1 人が外れたら接続を止める。 */
  subscribe: (listener: Listener) => () => void;
};

export function createLiveHub(getClient: () => LiveClient): LiveHub {
  const listeners = new Set<Listener>();
  let client: LiveClient | null = null;
  let channel: LiveChannel | null = null;
  let state: LiveConnection = 'connecting';

  function emit(event: LiveHubEvent) {
    for (const listener of listeners) listener(event);
  }

  function start() {
    state = 'connecting';
    client = getClient();
    const current = client.channel('courts-live');
    channel = current;

    const deliver =
      (toChange: (row: unknown) => LiveChange | null) => (payload: { new: unknown }) => {
        // 止めたあとに遅れて届いたものは捨てる
        if (channel !== current) return;
        const change = toChange(payload.new);
        if (change) emit({ type: 'change', change });
      };

    current
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        deliver(toMatchChange)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_scores' },
        deliver(toScoreChange)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_scores' },
        deliver(toScoreChange)
      )
      .subscribe((status) => {
        // 自分で止めたときの CLOSED を「途切れた」と取り違えない
        if (channel !== current) return;

        if (status === 'SUBSCRIBED') {
          const recovered = state === 'down';
          state = 'live';
          emit({ type: 'connection', state, recovered });
          return;
        }
        // 途切れ・失敗・時間切れ。Supabase は自動でつなぎ直すので、つながれば SUBSCRIBED が再び来る。
        // 続けて何度来ても、案内は 1 回だけ出す。
        if (state !== 'down') {
          state = 'down';
          emit({ type: 'connection', state, recovered: false });
        }
      });
  }

  function stop() {
    const stopping = channel;
    channel = null;
    if (client && stopping) client.removeChannel(stopping);
    client = null;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        start();
      } else {
        // 途中から使い始めた人にも、いまの状態をすぐ伝える
        listener({ type: 'connection', state, recovered: false });
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };
}

/**
 * アプリ全体で 1 つの購読。
 * Supabase の型付きクライアントは、ここで使う部分（channel / on / subscribe / removeChannel）が
 * `LiveClient` の形と合うが、`on` が引数ごとに細かく型分けされていて TypeScript が同じ形と見なせない。
 */
export const appLiveHub: LiveHub = createLiveHub(
  () => getSupabaseBrowserClient() as unknown as LiveClient
);

type Handlers = {
  onChange: (change: LiveChange) => void;
  /** 途切れていたのが、つながり直した。ここで 1 回だけ読み直す。 */
  onRecovered: () => void;
};

/** 結果LIVE を開いている間だけ、変化を受け取る。離れたら止める。戻り値は接続の状態。 */
export function useLiveUpdates(handlers: Handlers, hub: LiveHub = appLiveHub): LiveConnection {
  const [connection, setConnection] = useState<LiveConnection>('connecting');

  const handleEvent = useEffectEvent((event: LiveHubEvent) => {
    if (event.type === 'change') {
      handlers.onChange(event.change);
      return;
    }
    setConnection(event.state);
    if (event.recovered) handlers.onRecovered();
  });

  useEffect(() => hub.subscribe(handleEvent), [hub]);

  return connection;
}
