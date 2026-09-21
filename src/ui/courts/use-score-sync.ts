'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  rejectionMessage,
  retryDelayMs,
  shouldRetry,
  type SendResult,
} from '@/ui/courts/save-retry-policy';
import type { ScoreSyncStatus } from '@/ui/courts/types';

/**
 * ＋−で動いた得点を `POST /api/matches/[matchId]/scores` に送る・送り直す・まとめる仕組み。
 * 画面の部品（`courts-page.tsx`）から切り離してここに置く（仕様の「つくりの方針」）。
 *
 * - 同じ試合・同じゲームは送信中は 1 本だけ。返事が来た時点で値が変わっていれば、
 *   最新の値をもう 1 回送る（`sync` を呼ぶたびに「いま送りたい値」を上書きするだけで、
 *   実際の送信本数は増えない）
 * - つながらない／5xx／429 → 間隔を空けて自動で送り直す（save-retry-policy.ts の判断）
 * - それ以外の 4xx → 送り直さず、応答の日本語の理由を残す
 * - まだ保存できていない値がある間は、画面を閉じようとしたら確認を出す（beforeunload）
 *
 * **書き方について**: このアプリは React Compiler 向けの ESLint ルール
 * （`react-hooks/refs` など）を有効にしている。「描画（レンダー）の最中に ref を読み書きしない」
 * が特に強いルールなので、進行中の送信をたくさん覚えておく置き場（下の `createScoreSyncStore`）は
 * `useRef` ではなく、描画から見える値の受け渡しだけを担う `useSyncExternalStore` を通す。
 *
 * 仕様: docs/specs/2026-09-19-save-score-from-courts.md
 */

export type ScoreSyncInput = {
  matchId: string;
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

export type UseScoreSyncResult = {
  /** そのゲームの「いまの点数」を送る。呼ぶたびに送りたい値を最新にする。 */
  sync: (input: ScoreSyncInput) => void;
  /** 試合 id ごとの案内。表示するコートが `statusByMatchId[matchId]` を見る。 */
  statusByMatchId: Record<string, ScoreSyncStatus>;
};

const RETRYING_MESSAGE = '保存できていません・送り直しています';

type Score = { sideAScore: number; sideBScore: number };

type GameSyncState = {
  matchId: string;
  gameNumber: number;
  /** いま保存したい値（＋−を押すたびに上書きする）。 */
  desired: Score;
  /** 最後に保存できた値。まだ 1 度も保存できていなければ null。 */
  savedAsOf: Score | null;
  inFlight: boolean;
  /** 送り直しの間隔を決めるための、連続失敗回数。 */
  attempt: number;
  retryingMessage: string | null;
  rejectedMessage: string | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
};

function keyOf(matchId: string, gameNumber: number): string {
  return `${matchId}:${gameNumber}`;
}

function sameScore(a: Score | null, b: Score): boolean {
  return a !== null && a.sideAScore === b.sideAScore && a.sideBScore === b.sideBScore;
}

/** 応答の本文から日本語のエラーメッセージ（`{ error: string }`）を取り出す。取れなければ null。 */
async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // 本文が JSON でない・空のときは既定文言（save-retry-policy.ts）に任せる
  }
  return null;
}

/**
 * 実際の送信。**画面側の Supabase クライアントでは書かない**（AGENTS.md の「破ってはいけない 3 つ」の 1）。
 * 必ず Route Handler（`/api/matches/[matchId]/scores`）宛の fetch。
 */
async function sendScore(input: ScoreSyncInput): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`/api/matches/${input.matchId}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameNumber: input.gameNumber,
        sideAScore: input.sideAScore,
        sideBScore: input.sideBScore,
      }),
    });
  } catch {
    return { ok: false, kind: 'network' };
  }

  if (response.ok) return { ok: true };
  const message = await readErrorMessage(response);
  return { ok: false, kind: 'http', status: response.status, message };
}

type Listener = () => void;

/**
 * 進行中の送信をぜんぶ覚えておく置き場。**React の外**（ref でも state でもない、
 * ただの JavaScript のオブジェクト）に持つ。描画からは `useSyncExternalStore` 経由でだけ見る。
 */
type ScoreSyncStore = {
  sync: (input: ScoreSyncInput) => void;
  /** `useSyncExternalStore` に渡す。呼ぶたびに同じ中身なら同じ参照を返す。 */
  getSnapshot: () => Record<string, ScoreSyncStatus>;
  subscribe: (listener: Listener) => () => void;
  /** いまの時点で「まだ保存できていない値」があるか（beforeunload の判定で使う）。 */
  hasUnsentNow: () => boolean;
  /**
   * 画面に出ている間だけ送る。`stop` は画面を離れたときに呼び、待っている送り直しを止め、
   * 返事待ちの送信が戻ってきても次を送らないようにする。`start` で再開する
   * （開発時の React は画面を一度外して付け直すので、止めたままにはしない）。
   */
  start: () => void;
  stop: () => void;
};

function createScoreSyncStore(): ScoreSyncStore {
  const games = new Map<string, GameSyncState>();
  const listeners = new Set<Listener>();
  let snapshot: Record<string, ScoreSyncStatus> = {};
  let running = true;

  function recomputeSnapshot() {
    const next: Record<string, ScoreSyncStatus> = {};
    for (const game of games.values()) {
      const existing = next[game.matchId];
      next[game.matchId] = {
        retryingMessage: existing?.retryingMessage ?? game.retryingMessage,
        rejectedMessage: existing?.rejectedMessage ?? game.rejectedMessage,
      };
    }
    snapshot = next;
  }

  function notify() {
    recomputeSnapshot();
    for (const listener of listeners) listener();
  }

  function attemptSend(key: string) {
    const game = games.get(key);
    if (!game) return;

    game.inFlight = true;
    game.retryTimer = null;
    const sending = game.desired;

    sendScore({ matchId: game.matchId, gameNumber: game.gameNumber, ...sending }).then((result) => {
      const current = games.get(key);
      if (!current) return;
      current.inFlight = false;
      // 画面を離れたあとに戻ってきた返事では、次の送信もタイマーも仕掛けない
      // （仕掛けると、閉じた画面から裏で送り続けてしまう）。
      if (!running) return;

      if (result.ok) {
        current.attempt = 0;
        current.retryingMessage = null;
        current.rejectedMessage = null;
        current.savedAsOf = sending;
        // 送っている間にさらに値が変わっていれば、最新の値をもう 1 回送る
        if (!sameScore(current.savedAsOf, current.desired)) attemptSend(key);
        notify();
        return;
      }

      if (shouldRetry(result)) {
        current.attempt += 1;
        current.retryingMessage = RETRYING_MESSAGE;
        current.rejectedMessage = null;
        current.retryTimer = setTimeout(() => attemptSend(key), retryDelayMs(current.attempt));
        notify();
        return;
      }

      // shouldRetry が false を返すのは 'http'（4xx）のときだけ（'network' は必ず送り直す）。
      if (result.kind === 'http') {
        current.retryingMessage = null;
        current.rejectedMessage = rejectionMessage(result);
        notify();
      }
    });
  }

  return {
    sync(input) {
      const key = keyOf(input.matchId, input.gameNumber);
      let game = games.get(key);

      if (!game) {
        game = {
          matchId: input.matchId,
          gameNumber: input.gameNumber,
          desired: { sideAScore: input.sideAScore, sideBScore: input.sideBScore },
          savedAsOf: null,
          inFlight: false,
          attempt: 0,
          retryingMessage: null,
          rejectedMessage: null,
          retryTimer: null,
        };
        games.set(key, game);
      } else {
        game.desired = { sideAScore: input.sideAScore, sideBScore: input.sideBScore };
      }

      // 新しい操作が来たら、それまでの送り直し待ちはやめて、いますぐ試す。
      // 「送り直しています」は保存できるまで消さない（押しただけで消すと、まだ届いていないのに
      // 保存できたように見える）。断られた理由は、今回の値で送り直して改めて判断する。
      if (game.retryTimer) {
        clearTimeout(game.retryTimer);
        game.retryTimer = null;
      }
      game.rejectedMessage = null;

      if (!game.inFlight) attemptSend(key);
      notify();
    },

    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    hasUnsentNow() {
      for (const game of games.values()) {
        if (!sameScore(game.savedAsOf, game.desired)) return true;
      }
      return false;
    },

    start() {
      running = true;
      // 止めている間に取りやめた送り直しを、付け直したときに再開する
      for (const [key, game] of games) {
        if (!game.inFlight && game.retryingMessage) attemptSend(key);
      }
    },

    stop() {
      running = false;
      for (const game of games.values()) {
        if (game.retryTimer) clearTimeout(game.retryTimer);
        game.retryTimer = null;
      }
    },
  };
}

/**
 * サーバー側の描画（Next.js の SSR）では、この画面はまだ何も送っていない。
 * `useSyncExternalStore` はサーバーとクライアントの最初の見た目をそろえるための
 * 3 番目の引数（getServerSnapshot）を求めるので、常に空を返す。
 */
const EMPTY_STATUS_BY_MATCH_ID: Record<string, ScoreSyncStatus> = {};

export function useScoreSync(): UseScoreSyncResult {
  // 置き場そのものはコンポーネントの生涯で 1 つだけ作る。useState の初期化関数は
  // 初回描画でしか呼ばれないので、ここでは 1 度だけ new される（useRef の代わり。
  // 上のコメントのとおり、React Compiler 向けのルールが ref の描画中アクセスを禁じるため）。
  const [store] = useState(createScoreSyncStore);

  const statusByMatchId = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_STATUS_BY_MATCH_ID
  );

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!store.hasUnsentNow()) return;
      event.preventDefault();
      // Chrome は returnValue を見て確認画面を出す（値そのものは新しいブラウザでは使われない）。
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [store]);

  return { sync: store.sync, statusByMatchId };
}
