import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import {
  createMatchesScenario,
  deleteMatchesScenario,
  findSavedGameScore,
  writeGameScoreDirectly,
} from './helpers/courts-scenario';

/**
 * 結果LIVE の「他の人の点がその場で映る」（1-c）の確認。
 * 2 台のブラウザ（Playwright の context を 2 つ）で同じコートを開き、片方の操作がもう片方に映ることを見る。
 *
 * 試合は `createMatchesScenario` が作るテスト用のもの。seed の試合（コート 1）には頼らず、
 * `is_current` も触らない。テストごとに作り直し、最後に消す。
 */

const LIVE_COURT = 11;
const OTHER_COURT = 12;
const OLD_DONE_COURT = 13;

const LIVE_A = ['青山', '赤坂'];
const LIVE_B = ['緑川', '紫野'];
const NEXT_A = ['金子', '銀林'];
const NEXT_B = ['銅谷', '鉄井'];

let matchIds: Record<string, string>;

test.beforeEach(async () => {
  matchIds = await createMatchesScenario([
    {
      key: 'live',
      courtNumber: LIVE_COURT,
      orderInCourt: 1,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 11回戦',
      scores: [[5, 3]],
      teamA: [LIVE_A[0], LIVE_A[1]],
      teamB: [LIVE_B[0], LIVE_B[1]],
    },
    {
      key: 'next',
      courtNumber: LIVE_COURT,
      orderInCourt: 2,
      status: 'waiting',
      maxGameCount: 1,
      roundName: '予選 12回戦',
      scores: [],
      teamA: [NEXT_A[0], NEXT_A[1]],
      teamB: [NEXT_B[0], NEXT_B[1]],
    },
    {
      key: 'other',
      courtNumber: OTHER_COURT,
      orderInCourt: 1,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 13回戦',
      scores: [[7, 7]],
      teamA: ['白石', '黒田'],
      teamB: ['茶谷', '灰原'],
    },
    {
      // 1 つ前に出ない、もっと前に終わった試合（手元に読み込まれていない試合の変化を作るのに使う）
      key: 'older-done',
      courtNumber: OLD_DONE_COURT,
      orderInCourt: 1,
      status: 'done',
      finishedMinutesAgo: 120,
      maxGameCount: 1,
      roundName: '予選 14回戦',
      scores: [[21, 10]],
      teamA: ['桜井', '梅田'],
      teamB: ['松本', '竹内'],
    },
    {
      key: 'newer-done',
      courtNumber: OLD_DONE_COURT,
      orderInCourt: 2,
      status: 'done',
      finishedMinutesAgo: 5,
      maxGameCount: 1,
      roundName: '予選 15回戦',
      scores: [[21, 12]],
      teamA: ['杉本', '柳田'],
      teamB: ['桃井', '栗原'],
    },
    {
      key: 'older-next',
      courtNumber: OLD_DONE_COURT,
      orderInCourt: 3,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 16回戦',
      scores: [[1, 0]],
      teamA: ['楠田', '榊原'],
      teamB: ['椎名', '樫村'],
    },
  ]);
});

test.afterAll(deleteMatchesScenario);

function courtCard(page: Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

function plusButton(page: Page, courtNumber: number, names: string[]) {
  return courtCard(page, courtNumber).getByRole('button', {
    name: `${names.join('・')}の第1ゲームの得点を1増やす`,
  });
}

/** 読み直し（router.refresh）の回数を数える。画面全体を読み直すと、`/courts?_rsc=...` が飛ぶ。 */
function countRefreshes(page: Page) {
  const state = { count: 0 };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/courts' && url.searchParams.has('_rsc')) state.count += 1;
  });
  return state;
}

/** もう 1 台目のブラウザ（別の context）を開いて、結果LIVE を表示する。 */
async function openAnotherBrowser(
  browser: Browser,
  as: 'player' | 'viewer'
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (as === 'player') await enterAsPlayer(page, '愛知南', 'たろう');
  else await enterAsViewer(page);
  await page.goto('/courts');
  await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  return { context, page };
}

test.describe('2 台のブラウザで、他の人の点がその場で映る', () => {
  test('片方で ＋ を押すと、もう片方に数秒以内に同じ点数が出る（開き直さない）', async ({
    browser,
  }) => {
    const first = await openAnotherBrowser(browser, 'player');
    const second = await openAnotherBrowser(browser, 'player');
    const refreshes = countRefreshes(second.page);
    // 接続がつながってから押す（つながる前の点は、読み込んだ時点の値に含まれる）
    await second.page.waitForTimeout(1500);

    await plusButton(first.page, LIVE_COURT, LIVE_A).click();

    const cardOnSecond = courtCard(second.page, LIVE_COURT);
    await expect(cardOnSecond.getByText('6', { exact: true })).toBeVisible({ timeout: 5000 });
    expect(refreshes.count).toBe(0);

    await first.context.close();
    await second.context.close();
  });

  test('観戦者の画面にも他の人の点が映る', async ({ browser }) => {
    const player = await openAnotherBrowser(browser, 'player');
    const viewer = await openAnotherBrowser(browser, 'viewer');
    await viewer.page.waitForTimeout(1500);

    await plusButton(player.page, LIVE_COURT, LIVE_B).click();

    await expect(courtCard(viewer.page, LIVE_COURT).getByText('4', { exact: true })).toBeVisible({
      timeout: 5000,
    });
    // 観戦者には ＋ − が無いまま
    await expect(
      courtCard(viewer.page, LIVE_COURT).getByRole('button', { name: /得点/ })
    ).toHaveCount(0);

    await player.context.close();
    await viewer.context.close();
  });

  test('点が変わるたびに画面全体を読み直していない（10 回押しても読み直しは 0 回）', async ({
    browser,
  }) => {
    const first = await openAnotherBrowser(browser, 'player');
    const second = await openAnotherBrowser(browser, 'viewer');
    const refreshes = countRefreshes(second.page);
    await second.page.waitForTimeout(1500);

    for (let press = 0; press < 10; press += 1) {
      await plusButton(first.page, LIVE_COURT, LIVE_A).click();
    }

    await expect(courtCard(second.page, LIVE_COURT).getByText('15', { exact: true })).toBeVisible({
      timeout: 8000,
    });
    // 点が届いたあと、少し待っても読み直しは走らない
    await second.page.waitForTimeout(1500);
    expect(refreshes.count).toBe(0);

    await first.context.close();
    await second.context.close();
  });

  test('送れていない手元の点は、届いた古い点で上書きされない', async ({ browser }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    await mine.page.waitForTimeout(1500);

    // 保存を失敗させ、押した点が「送れていない」ままになるようにする
    await mine.page.route('**/api/matches/*/scores', (route) => route.abort());
    await plusButton(mine.page, LIVE_COURT, LIVE_A).click();
    await expect(courtCard(mine.page, LIVE_COURT).getByRole('status')).toContainText(
      '保存できていません'
    );
    await expect(courtCard(mine.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible();

    // そこへ、別の人の（古い）点が届く
    await writeGameScoreDirectly(matchIds.live, 1, 5, 3);
    await mine.page.waitForTimeout(1500);

    await expect(courtCard(mine.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible();

    await mine.context.close();
  });
});

test.describe('手元に無い試合の変化が届いたとき', () => {
  test('1 回だけ読み直す（続けて変わっても 1 回）', async ({ browser }) => {
    const watcher = await openAnotherBrowser(browser, 'viewer');
    const refreshes = countRefreshes(watcher.page);
    await watcher.page.waitForTimeout(1500);

    // 読み込まれていない（1 つ前でもない）古い試合の点を、続けて 3 回書き換える
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 11);
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 12);
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 13);

    await expect.poll(() => refreshes.count, { timeout: 5000 }).toBe(1);
    await watcher.page.waitForTimeout(3500);
    expect(refreshes.count).toBe(1);

    await watcher.context.close();
  });
});

test.describe('自動更新が途切れたとき', () => {
  /**
   * 購読の接続（WebSocket）を、テストの側から切る・つなげないようにする。
   * 本物の電波を切る代わりに、Playwright の routeWebSocket で接続の行き来を握る。
   */
  async function controlRealtimeSocket(page: Page) {
    const sockets: Array<{ close: () => void }> = [];
    const control = { blocked: false };
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
      if (control.blocked) {
        void socket.close();
        return;
      }
      socket.connectToServer();
      sockets.push(socket);
    });
    return {
      cut() {
        control.blocked = true;
        for (const socket of sockets.splice(0)) socket.close();
      },
      restore() {
        control.blocked = false;
      },
    };
  }

  test('案内が出て、つながると 1 回だけ読み直し、途切れている間の点が出る', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const realtime = await controlRealtimeSocket(page);
    await enterAsViewer(page);
    await page.goto('/courts');
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
    await page.waitForTimeout(1500);
    const refreshes = countRefreshes(page);

    realtime.cut();
    await expect(page.getByTestId('live-down-notice')).toContainText('自動更新が止まっています', {
      timeout: 15_000,
    });

    // 途切れている間に、点が入る（この画面には届かない）
    await writeGameScoreDirectly(matchIds.live, 1, 9, 3);
    await page.waitForTimeout(500);
    await expect(courtCard(page, LIVE_COURT).getByText('9', { exact: true })).toHaveCount(0);

    realtime.restore();
    await expect(page.getByTestId('live-down-notice')).toHaveCount(0, { timeout: 30_000 });
    await expect(courtCard(page, LIVE_COURT).getByText('9', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(1500);
    expect(refreshes.count).toBe(1);

    await context.close();
  });

  for (const width of [375, 390]) {
    test(`${width}px 幅で、案内が出た状態でも横にはみ出さない`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const realtime = await controlRealtimeSocket(page);
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.goto('/courts');
      await expect(courtCard(page, LIVE_COURT)).toBeVisible();
      await page.waitForTimeout(1500);

      realtime.cut();
      const notice = page.getByTestId('live-down-notice');
      await expect(notice).toBeVisible({ timeout: 15_000 });

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth).toBe(width);
      expect(scrollWidth).toBe(innerWidth);
      const box = await notice.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);

      await context.close();
    });
  }
});

test('他の人の押した点が保存されている（2 台目の画面の表示と、データベースの値が一致する）', async ({
  browser,
}) => {
  const first = await openAnotherBrowser(browser, 'player');
  const second = await openAnotherBrowser(browser, 'viewer');
  await second.page.waitForTimeout(1500);

  await plusButton(first.page, LIVE_COURT, LIVE_A).click();

  await expect(courtCard(second.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect
    .poll(() => findSavedGameScore(matchIds.live, 1))
    .toEqual({ sideAScore: 6, sideBScore: 3 });

  await first.context.close();
  await second.context.close();
});
