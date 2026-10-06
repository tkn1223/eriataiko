'use client';

import { useSyncExternalStore } from 'react';
import { hasAnyPoint } from '@/domain/scoring';
import {
  rejectionMessage,
  retryDelayMs,
  shouldRetry,
  type SendResult,
} from '@/ui/courts/save-retry-policy';
import type { MatchSyncState } from '@/ui/courts/types';

/**
 * ＋−で動いた得点を `POST /api/matches/[matchId]/scores` に送る・送り直す・まとめる仕組み。
 * 画面の部品（`courts-page.tsx`）から切り離してここに置く（仕様の「つくりの方針」）。
 *
 * - 同じ試合・同じゲームは送信中は 1 本だけ。返事が来た時点で値が変わっていれば、
 *   最新の値をもう 1 回送る（`sync` を呼ぶたびに「いま送りたい値」を上書きするだけで、
 *   実際の送信本数は増えない）
 * - つながらない／5xx／429 → 間隔を空けて自動で送り直す（save-retry-policy.ts の判断）
 * - それ以外の 4xx → 送り直さず、応答の日本語の理由を残す
 * - まだ保存できていない値がある間は、ブラウザを閉じる・更新しようとしたら確認を出す（beforeunload）
 *
 * **預かる場所（`appScoreSyncStore`）はアプリ全体で 1 つ。** 結果LIVE の画面とは別に、
 * このファイルが読み込まれたときに 1 度だけ作り、ブラウザのタブを閉じる・更新するまで生き続ける。
 * 以前は画面（`useScoreSync` を呼ぶ部品）と一緒に作って捨てていたため、送れていない点があるまま
 * 下のメニューで別の画面に移ると、送り直しも点も一緒に消えていた（PR #57 レビュー）。
 * 置き場所を「`(app)` の layout に Provider を置く」ではなくモジュールにしたのは、
 * - 預かるのは画面の見た目ではなく、ただの数字と送信の予定なので React の木に載せる必要がなく、
 * - Provider だと「どの画面より外側に置く」ことを layout の作りに頼ることになり、
 *   将来 layout を組み替えたときに黙って捨てられる道が再び開くため。
 * モジュールならどの画面から呼んでも同じ 1 つで、画面の作りに左右されない。
 * **サーバー側の描画では何も預からないし、中身も読まない。** サーバーでもこのファイルは読み込まれ、
 * そこでの預かり場所はアクセスした全員で 1 つになる。もし値が入ったり、描画で中身を読んで HTML に
 * 混ぜたりすると、ある人の未送信の点が別の人の画面に出る。そこで
 * - `sync` はブラウザの外（`window` が無いところ）では何もしない
 * - 描画は `useSyncExternalStore` の 3 番目の引数（サーバー用）で常に空を見る
 * の 2 つで止めている（use-score-sync.server.test.ts と use-score-sync.test.tsx で確かめている）。
 *
 * 送るか諦めるかの判断は `save-retry-policy.ts`。画面を離れても返事は反映し、送り直しも続ける。
 *
 * **書き方について**: このアプリは React Compiler 向けの ESLint ルール
 * （`react-hooks/refs` など）を有効にしている。「描画（レンダー）の最中に ref を読み書きしない」
 * が特に強いルールなので、進行中の送信をたくさん覚えておく置き場は `useRef` ではなく、
 * React の外のただのオブジェクトにして、描画からは `useSyncExternalStore` 経由でだけ見る。
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
  /**
   * 試合 id ごとの案内と、まだ送れていない数字。表示するコートが `statusByMatchId[matchId]` を見る。
   * 一度でも送った試合だけが入る（送っていない試合は無い）。
   */
  statusByMatchId: Record<string, MatchSyncState>;
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
  /**
   * 一度でも 0 対 0 以外の点を押したか。あとで 0 対 0 に戻しても true のまま。
   * 呼出待ちから始めた試合を、別の画面から戻ったときも LIVE の見た目に保つのに使う
   * （画面の `LiveScore.started` と同じ決まり。0 対 0 に戻した値が送れていないまま戻ると、
   * 数字だけでは「始まった試合」と分からず呼出待ちに見えてしまうため）。
   */
  pointPressed: boolean;
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

/** まだサーバーに届いたと確かめられていないか（送信中・送り直し待ち・断られたまま、を全部含む）。 */
function isUnsent(game: GameSyncState): boolean {
  return game.inFlight || !sameScore(game.savedAsOf, game.desired);
}

/**
 * 進行中の送信をぜんぶ覚えておく置き場。**React の外**（ref でも state でもない、
 * ただの JavaScript のオブジェクト）に持つ。描画からは `useSyncExternalStore` 経由でだけ見る。
 */
export type ScoreSyncStore = {
  sync: (input: ScoreSyncInput) => void;
  /** `useSyncExternalStore` に渡す。呼ぶたびに同じ中身なら同じ参照を返す。 */
  getSnapshot: () => Record<string, MatchSyncState>;
  subscribe: (listener: Listener) => () => void;
  /**
   * 預かっている点・待っている送り直し・beforeunload の見張りをぜんぶ捨てる。
   * アプリの中では呼ばない（アプリごと閉じれば全部消えるため）。テストが 1 つごとに空にするための後片付け。
   */
  dispose: () => void;
};

export function createScoreSyncStore(): ScoreSyncStore {
  const games = new Map<string, GameSyncState>();
  const listeners = new Set<Listener>();
  let snapshot: Record<string, MatchSyncState> = {};
  let unloadGuardInstalled = false;

  /**
   * ブラウザを閉じる・更新しようとしたときの確認（beforeunload）。
   * **画面ではなくここ（預かり場所）が持つ。** 画面を離れても、点を預かっている間は確認が要るため。
   * 預かっている点が無いときは外しておく（何も無いのに確認を出さない・リスナーを残さない）。
   */
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault();
    // Chrome は returnValue を見て確認画面を出す（値そのものは新しいブラウザでは使われない）。
    event.returnValue = '';
  }

  function syncUnloadGuard() {
    if (typeof window === 'undefined') return;
    const needed = [...games.values()].some(isUnsent);
    if (needed && !unloadGuardInstalled) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      unloadGuardInstalled = true;
    } else if (!needed && unloadGuardInstalled) {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unloadGuardInstalled = false;
    }
  }

  function recomputeSnapshot() {
    const next: Record<string, MatchSyncState> = {};
    for (const game of games.values()) {
      const existing = next[game.matchId];
      next[game.matchId] = {
        retryingMessage: existing?.retryingMessage ?? game.retryingMessage,
        rejectedMessage: existing?.rejectedMessage ?? game.rejectedMessage,
        started: (existing?.started ?? false) || game.pointPressed,
        unsentScores: [
          ...(existing?.unsentScores ?? []),
          ...(isUnsent(game) ? [{ gameNumber: game.gameNumber, ...game.desired }] : []),
        ],
      };
    }
    snapshot = next;
  }

  function notify() {
    recomputeSnapshot();
    syncUnloadGuard();
    for (const listener of listeners) listener();
  }

  function attemptSend(key: string) {
    const game = games.get(key);
    if (!game) return;

    game.inFlight = true;
    game.retryTimer = null;
    const sending = game.desired;

    sendScore({ matchId: game.matchId, gameNumber: game.gameNumber, ...sending }).then((result) => {
      // 返事を待っている間に dispose された（テストの後片付け）ときは何もしない
      const current = games.get(key);
      if (current !== game) return;
      current.inFlight = false;

      // 画面を離れていても返事は反映する。返事を捨てると、保存できたのに「まだ保存できていない」と
      // 覚えたままになる（仕様 2026-10-04 の決めたこと 3）。

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
      // サーバー側の描画では何も預からない。このモジュールの預かり場所はサーバーのプロセスでは
      // 全員で 1 つになるので、ここに値が入ると、ある人の点が別の人の画面（HTML）に混ざる。
      // 今は押したとき（ブラウザ）にしか呼ばれないが、将来うっかり描画中に呼んでも入らないように止める。
      if (typeof window === 'undefined') return;

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
          pointPressed: false,
        };
        games.set(key, game);
      } else {
        game.desired = { sideAScore: input.sideAScore, sideBScore: input.sideBScore };
      }
      if (hasAnyPoint([{ gameNumber: game.gameNumber, ...game.desired }])) game.pointPressed = true;

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

    dispose() {
      for (const game of games.values()) {
        if (game.retryTimer) clearTimeout(game.retryTimer);
      }
      games.clear();
      notify();
    },
  };
}

/**
 * アプリ全体で 1 つの預かり場所。どの画面から `useScoreSync` を呼んでも、これを見る。
 * （このファイルの先頭の説明を参照。）
 */
export const appScoreSyncStore: ScoreSyncStore = createScoreSyncStore();

/**
 * サーバー側の描画（Next.js の SSR）では、まだ何も送っていない。
 * `useSyncExternalStore` はサーバーとクライアントの最初の見た目をそろえるための
 * 3 番目の引数（getServerSnapshot）を求めるので、常に空を返す。
 */
const EMPTY_STATUS_BY_MATCH_ID: Record<string, MatchSyncState> = {};

export function useScoreSync(): UseScoreSyncResult {
  const statusByMatchId = useSyncExternalStore(
    appScoreSyncStore.subscribe,
    appScoreSyncStore.getSnapshot,
    () => EMPTY_STATUS_BY_MATCH_ID
  );

  return { sync: appScoreSyncStore.sync, statusByMatchId };
}
