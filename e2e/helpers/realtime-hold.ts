import type { Page } from '@playwright/test';

/**
 * 購読（Realtime）で届く「試合の状態の変化」を、テストの側で止めておき、好きなときに流す。
 * 体育館の弱い電波で、知らせが返事より数秒遅れて届くのを、時間に頼らず再現するため。
 *
 * 止めるのは `matches` の変化だけ。点（`game_scores`）や接続の生存確認は止めない
 * （止めると接続が切れたと見なされ、つなぎ直しで読み直しが走ってしまう）。
 * 流すときは、止めていた順のまま、そのあとに届くものより先に画面へ渡す。
 */
export async function holdRealtimeMatchChanges(page: Page) {
  const state = { holding: false };
  const held: Array<() => void> = [];

  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    const server = socket.connectToServer();
    // onMessage を付けると、サーバーから画面への転送は自分でやることになる
    server.onMessage((message) => {
      const isMatchChange = typeof message === 'string' && message.includes('"table":"matches"');
      if (state.holding && isMatchChange) {
        held.push(() => socket.send(message));
        return;
      }
      socket.send(message);
    });
  });

  return {
    /** ここから先に届く試合の変化を止める。 */
    hold() {
      state.holding = true;
    },
    /** 止めている知らせの数。止めたい知らせが届ききるのを待つのに使う。 */
    heldCount() {
      return held.length;
    },
    /** 止めていた知らせを順に流し、以後は止めない。 */
    release() {
      state.holding = false;
      for (const send of held.splice(0)) send();
    },
  };
}
