import { expect, test, type Browser, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import { takeScorer } from './helpers/scorer';
import {
  createMatchesScenario,
  findMatchScorer,
  deleteMatchesScenario,
  findMatchResult,
  findSavedGameScore,
  finishMatchDirectly,
  reopenMatchDirectly,
  writeGameScoreDirectly,
} from './helpers/courts-scenario';
import { holdRealtimeMatchChanges } from './helpers/realtime-hold';

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
const LONG_COURT = 14;

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
      // 空白入りの長い名前（375px でいちばん詰まる形）。1 つ前と直し中の見た目を測るのに使う
      key: 'long-done',
      courtNumber: LONG_COURT,
      orderInCourt: 1,
      status: 'done',
      finishedMinutesAgo: 3,
      maxGameCount: 3,
      roundName: '決勝トーナメント 準決勝',
      scores: [
        [21, 19],
        [18, 21],
        [21, 20],
      ],
      teamA: ['五十嵐　十四郎', '長谷川 一二三'],
      teamB: ['佐々木 太郎', '小早川　日下部'],
    },
    {
      key: 'long-live',
      courtNumber: LONG_COURT,
      orderInCourt: 2,
      status: 'live',
      maxGameCount: 3,
      roundName: '決勝トーナメント 決勝',
      scores: [[10, 8]],
      teamA: ['五十嵐　十四郎', '長谷川 一二三'],
      teamB: ['佐々木 太郎', '小早川　日下部'],
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

/** 画面全体の読み直し（router.refresh）か。読み直すと `/courts?_rsc=...` が飛ぶ。 */
function isCourtsRefresh(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname === '/courts' && parsed.searchParams.has('_rsc');
}

/** 読み直し（router.refresh）の回数を、呼んだ時点から数える。 */
function countRefreshes(page: Page) {
  const state = { count: 0 };
  page.on('request', (request) => {
    if (isCourtsRefresh(request.url())) state.count += 1;
  });
  return state;
}

/**
 * 結果LIVE を開き、購読がつながるまで待つ。
 * 購読は、つながる前の変化を届けないので、画面はつながったときに 1 回だけ読み直す。
 * その読み直しの返事を「つながった」の合図にする（時間を決めて待たない）。
 * 戻り値は、そのあとの読み直しの回数（最初の 1 回は数えない）。
 */
async function openCourtsAndWaitForLive(page: Page) {
  const caughtUp = page.waitForResponse((response) => isCourtsRefresh(response.url()));
  await page.goto('/courts');
  await caughtUp;
  return countRefreshes(page);
}

/** もう 1 台目のブラウザ（別の context）を開いて、結果LIVE を表示し、購読がつながるまで待つ。 */
async function openAnotherBrowser(browser: Browser, as: 'player' | 'viewer') {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (as === 'player') await enterAsPlayer(page, '愛知南', 'たろう');
  else await enterAsViewer(page);
  const refreshes = await openCourtsAndWaitForLive(page);
  await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  // ＋ − と「試合を終了する」は担当にだけ出る。選手は先に「得点を入力する」を 1 度押す
  if (as === 'player') await takeScorer(courtCard(page, LIVE_COURT));
  return { context, page, refreshes };
}

/**
 * 先に書いた変化の知らせが、その画面に届いて当て終わるのを待つ。
 * 知らせは書いた順に届くので、あとから別のコートに書いた点が映れば、先の変化も届いている
 * （「届いても映らない」ことを確かめるときに、時間を決めて待たずに済む）。
 */
async function waitUntilEarlierChangesArrive(page: Page, otherCourtScore: number) {
  await writeGameScoreDirectly(matchIds.other, 1, otherCourtScore, 0);
  await expect(
    courtCard(page, OTHER_COURT).getByText(String(otherCourtScore), { exact: true })
  ).toBeVisible({ timeout: 5000 });
}

test.describe('2 台のブラウザで、他の人の点がその場で映る', () => {
  test('片方で ＋ を押すと、もう片方に数秒以内に同じ点数が出る（開き直さない）', async ({
    browser,
  }) => {
    const first = await openAnotherBrowser(browser, 'player');
    const second = await openAnotherBrowser(browser, 'player');

    await plusButton(first.page, LIVE_COURT, LIVE_A).click();

    const cardOnSecond = courtCard(second.page, LIVE_COURT);
    await expect(cardOnSecond.getByText('6', { exact: true })).toBeVisible({ timeout: 5000 });
    expect(second.refreshes.count).toBe(0);

    await first.context.close();
    await second.context.close();
  });

  test('観戦者の画面にも他の人の点が映る', async ({ browser }) => {
    const player = await openAnotherBrowser(browser, 'player');
    const viewer = await openAnotherBrowser(browser, 'viewer');

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

  test('点が変わるたびに画面全体を読み直していない（つながったときの 1 回のあと、10 回押しても 0 回）', async ({
    browser,
  }) => {
    const first = await openAnotherBrowser(browser, 'player');
    const second = await openAnotherBrowser(browser, 'viewer');

    for (let press = 0; press < 10; press += 1) {
      await plusButton(first.page, LIVE_COURT, LIVE_A).click();
    }

    await expect(courtCard(second.page, LIVE_COURT).getByText('15', { exact: true })).toBeVisible({
      timeout: 8000,
    });
    // 点が届いたあとに書いた別のコートの点まで届いても、読み直しは走っていない
    await waitUntilEarlierChangesArrive(second.page, 30);
    expect(second.refreshes.count).toBe(0);

    await first.context.close();
    await second.context.close();
  });

  test('送れていない手元の点は、届いた古い点で上書きされない', async ({ browser }) => {
    const mine = await openAnotherBrowser(browser, 'player');

    // 保存を失敗させ、押した点が「送れていない」ままになるようにする
    await mine.page.route('**/api/matches/*/scores', (route) => route.abort());
    await plusButton(mine.page, LIVE_COURT, LIVE_A).click();
    await expect(courtCard(mine.page, LIVE_COURT).getByRole('status')).toContainText(
      '保存できていません'
    );
    await expect(courtCard(mine.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible();

    // そこへ、別の人の（古い）点が届く
    await writeGameScoreDirectly(matchIds.live, 1, 5, 3);
    await waitUntilEarlierChangesArrive(mine.page, 30);

    await expect(courtCard(mine.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible();

    await mine.context.close();
  });
});

test.describe('手元に無い試合の変化が届いたとき', () => {
  test('1 回だけ読み直す（続けて変わっても 1 回）', async ({ browser }) => {
    const watcher = await openAnotherBrowser(browser, 'viewer');

    // 読み込まれていない（1 つ前でもない）古い試合の点を、続けて 3 回書き換える
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 11);
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 12);
    await writeGameScoreDirectly(matchIds['older-done'], 1, 21, 13);

    await expect.poll(() => watcher.refreshes.count, { timeout: 5000 }).toBe(1);
    // 2 回目が走らないことは、読み直しの最小の間隔（3 秒、courts-page.tsx）を過ぎるまで見る。
    // 「起きない」ことは、待つ以外に確かめようがない
    await watcher.page.waitForTimeout(3500);
    expect(watcher.refreshes.count).toBe(1);

    await watcher.context.close();
  });
});

test.describe('開いてから購読がつながるまでの間の変化', () => {
  test('サーバーが読んだあと、購読がつながる前に終わった試合も、つながると映る', async ({
    browser,
  }) => {
    // 終了の知らせが配られ終わったことを確かめるための、もう 1 台（先につながっている）
    const witness = await openAnotherBrowser(browser, 'viewer');

    const context = await browser.newContext();
    const page = await context.newPage();
    await enterAsViewer(page);
    // 購読の接続（WebSocket）を、合図があるまでつなげない（電波の細い体育館で、つながるのが遅い状態）
    let letConnect!: () => void;
    const connectAllowed = new Promise<void>((resolve) => {
      letConnect = resolve;
    });
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, async (socket) => {
      await connectAllowed;
      socket.connectToServer();
    });

    await page.goto('/courts');
    const card = courtCard(page, LIVE_COURT);
    await expect(card.getByText('LIVE')).toBeVisible();

    // 画面はもう読み込んだが、購読はまだつながっていない。その間に試合が終わる。
    // 知らせが配られ終わってから（先につながっている 1 台に届いてから）つなぐので、この画面には届かない
    await finishMatchDirectly(matchIds.live);
    await expect(courtCard(witness.page, LIVE_COURT).getByText('LIVE')).toHaveCount(0, {
      timeout: 5000,
    });
    letConnect();

    await expect(card.getByText('LIVE')).toHaveCount(0, { timeout: 15_000 });
    await expect(card.getByText('呼出待ち')).toBeVisible();
    await expect(page.getByTestId(`previous-match-${LIVE_COURT}`)).toContainText(LIVE_A[0]);

    await context.close();
    await witness.context.close();
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
    const refreshes = await openCourtsAndWaitForLive(page);
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();

    realtime.cut();
    await expect(page.getByTestId('live-down-notice')).toContainText('自動更新が止まっています', {
      timeout: 15_000,
    });

    // 途切れている間に、点が入る（この画面には届かない）
    await writeGameScoreDirectly(matchIds.live, 1, 9, 3);

    realtime.restore();
    await expect(page.getByTestId('live-down-notice')).toHaveCount(0, { timeout: 30_000 });
    await expect(courtCard(page, LIVE_COURT).getByText('9', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    // つながり直したあとに書いた点まで届いても、読み直しは 1 回のまま
    await waitUntilEarlierChangesArrive(page, 30);
    expect(refreshes.count).toBe(1);

    await context.close();
  });

  for (const width of [375, 390]) {
    test(`${width}px 幅で、案内が出た状態でも横にはみ出さない`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const realtime = await controlRealtimeSocket(page);
      await enterAsPlayer(page, '愛知南', 'たろう');
      await openCourtsAndWaitForLive(page);
      await expect(courtCard(page, LIVE_COURT)).toBeVisible();

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

/**
 * 試合の終了（1-d の前半）。「試合を終了する」→「OK」で終了がデータベースに記録される。
 * 送れていない点があれば、点が届いてから終了が送られる。
 */
test.describe('試合の終了', () => {
  const RESULT_URL = '**/api/matches/*/result';
  const SCORES_URL = '**/api/matches/*/scores';

  async function finishLiveCourt(page: Page) {
    const card = courtCard(page, LIVE_COURT);
    await card.getByRole('button', { name: '試合を終了する' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    return card;
  }

  test('今の試合の確認画面を開いている間に、ほかの人がその試合を終了したら、確認画面は閉じる（次の試合の中身で開いたままにならない）', async ({
    browser,
  }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    const card = courtCard(mine.page, LIVE_COURT);
    await card.getByRole('button', { name: '試合を終了する' }).click();
    const dialog = mine.page.getByRole('dialog');
    await expect(dialog.getByText(LIVE_A.join('・'), { exact: false }).first()).toBeVisible();

    // ほかの人が、その試合を終了した
    await finishMatchDirectly(matchIds.live);

    await expect(
      mine.page.getByTestId(`previous-match-${LIVE_COURT}`).getByText(LIVE_A.join('・'))
    ).toBeVisible({ timeout: 5000 });
    // 次の試合（金子・銀林 vs 銅谷・鉄井）の確認画面が開いたままになっていない
    await expect(dialog).toHaveCount(0);

    await mine.context.close();
  });

  test('OK でデータベースの試合が終了になる。開き直しても終了のまま', async ({ browser }) => {
    const mine = await openAnotherBrowser(browser, 'player');

    await finishLiveCourt(mine.page);

    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');
    expect((await findMatchResult(matchIds.live))?.finishedAt).not.toBeNull();

    await mine.page.reload();
    const card = courtCard(mine.page, LIVE_COURT);
    await expect(card.getByText('LIVE')).toHaveCount(0);
    await expect(card.getByText(NEXT_A.join('・'))).toBeVisible();
    expect((await findMatchResult(matchIds.live))?.status).toBe('done');

    await mine.context.close();
  });

  test('片方で試合を終了すると、もう片方でもそのコートが次の試合に切り替わる', async ({
    browser,
  }) => {
    const first = await openAnotherBrowser(browser, 'player');
    const second = await openAnotherBrowser(browser, 'viewer');
    await expect(courtCard(second.page, LIVE_COURT).getByText('LIVE')).toBeVisible();

    await finishLiveCourt(first.page);

    const cardOnSecond = courtCard(second.page, LIVE_COURT);
    await expect(cardOnSecond.getByText('LIVE')).toHaveCount(0, { timeout: 5000 });
    await expect(cardOnSecond.getByText('呼出待ち')).toBeVisible();
    await expect(cardOnSecond.getByText(NEXT_A.join('・'))).toBeVisible();
    // 切り替わりは、届いた行を当てただけ（画面全体は読み直さない）
    expect(second.refreshes.count).toBe(0);

    await first.context.close();
    await second.context.close();
  });

  test('終了を送っている間は「終了を送っています」が出て、記録されると消える', async ({
    browser,
  }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    // 返事を少し遅らせて、送っている間の表示を見られるようにする
    await mine.page.route(RESULT_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    const card = await finishLiveCourt(mine.page);
    await expect(card.getByRole('status')).toContainText('終了を送っています');

    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');
    await expect(card.getByText('終了を送っています')).toHaveCount(0);

    await mine.context.close();
  });

  test('送れていない点があるまま終了を押すと「終了を送っています」と出て、点が届いたあとで終了が記録される', async ({
    browser,
  }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    const sent = { scores: 0, result: 0 };
    mine.page.on('request', (request) => {
      if (request.url().endsWith('/scores')) sent.scores += 1;
      if (request.url().endsWith('/result')) sent.result += 1;
    });

    // 点が送れない状態で ＋ を押し、そのまま終了を押す
    await mine.page.route(SCORES_URL, (route) => route.abort());
    await plusButton(mine.page, LIVE_COURT, LIVE_A).click();
    const card = courtCard(mine.page, LIVE_COURT);
    await expect(card.getByRole('status')).toContainText('保存できていません');
    await finishLiveCourt(mine.page);

    await expect(card.getByRole('status')).toContainText('終了を送っています');
    await expect(card.getByRole('status')).toContainText('保存できていません');
    // 点を送り直しても届かない間は、終了を送らない（記録もされていない）
    await expect.poll(() => sent.scores, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    expect(sent.result).toBe(0);
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');

    // 電波が戻ると、点が先に届き、そのあと終了が記録される（点は断られず、消えない）
    await mine.page.unroute(SCORES_URL);
    await expect
      .poll(async () => (await findMatchResult(matchIds.live))?.status, { timeout: 20_000 })
      .toBe('done');
    expect(await findSavedGameScore(matchIds.live, 1)).toEqual({ sideAScore: 6, sideBScore: 3 });

    await mine.context.close();
  });

  test('終了を送れない間は送り直し、つながったら記録される', async ({ browser }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    await mine.page.route(RESULT_URL, (route) => route.abort());

    const card = await finishLiveCourt(mine.page);
    await expect(card.getByRole('status')).toContainText('終了を送っています・送り直しています');
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');

    await mine.page.unroute(RESULT_URL);
    await expect
      .poll(async () => (await findMatchResult(matchIds.live))?.status, { timeout: 20_000 })
      .toBe('done');

    await mine.context.close();
  });

  test('終了を入口に断られたら、日本語の理由が出て、もう一度押せる', async ({ browser }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    await mine.page.route(RESULT_URL, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'テスト用の断りの理由です。' }),
      })
    );

    const card = await finishLiveCourt(mine.page);

    await expect(card.getByRole('status')).toContainText('テスト用の断りの理由です。');
    await expect(card.getByRole('button', { name: '試合を終了する' })).toBeVisible();
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');

    await mine.context.close();
  });

  for (const width of [375, 390]) {
    test(`${width}px 幅で、「終了を送っています」が出た状態でも横にはみ出さない`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.goto('/courts');
      await expect(courtCard(page, LIVE_COURT)).toBeVisible();
      await takeScorer(courtCard(page, LIVE_COURT));
      await page.route(SCORES_URL, (route) => route.abort());
      await plusButton(page, LIVE_COURT, LIVE_A).click();
      await expect(courtCard(page, LIVE_COURT).getByRole('status')).toBeVisible();
      const card = await finishLiveCourt(page);
      await expect(card.getByRole('status')).toContainText('終了を送っています');

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth).toBe(width);
      expect(scrollWidth).toBe(innerWidth);
      const stickingOut = await card.evaluate((element) => {
        const cardRect = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('*'))
          .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
          .filter(
            ({ rect }) =>
              rect.width > 0 &&
              (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5)
          )
          .map(({ text }) => text);
      });
      expect(stickingOut).toEqual([]);

      await context.close();
    });
  }
});

/**
 * 1 つ前と直す（1-d の後半）。コート 13 は、1 つ前（杉本・柳田 対 桃井・栗原、21-12）と、
 * 進行中の次の試合（楠田・榊原 対 椎名・樫村、1-0）がある。
 */
test.describe('1つ前と直す', () => {
  const PREVIOUS_A = ['杉本', '柳田'];
  const NEXT_LIVE_A = ['楠田', '榊原'];

  function previousRow(page: Page) {
    return page.getByTestId(`previous-match-${OLD_DONE_COURT}`);
  }

  function fixingPanel(page: Page) {
    return page.getByTestId(`fixing-match-${OLD_DONE_COURT}`);
  }

  async function openCourts(browser: Browser, as: 'player' | 'viewer') {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (as === 'player') await enterAsPlayer(page, '愛知南', 'たろう');
    else await enterAsViewer(page);
    const refreshes = await openCourtsAndWaitForLive(page);
    await expect(courtCard(page, OLD_DONE_COURT)).toBeVisible();
    // 今の試合（楠田・榊原）に点を入れられるよう、選手は先に担当になる
    if (as === 'player') await takeScorer(courtCard(page, OLD_DONE_COURT));
    return { context, page, refreshes };
  }

  async function reopenPrevious(page: Page) {
    await previousRow(page).getByRole('button', { name: '直す' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
  }

  test('終了したコートに「1つ前」の試合（部・両ペア・スコア）と「直す」が出る。もっと前の試合は出ない', async ({
    browser,
  }) => {
    const { context, page } = await openCourts(browser, 'player');

    const row = previousRow(page);
    await expect(row.getByText('1つ前')).toBeVisible();
    await expect(row.getByText('1部')).toBeVisible();
    await expect(row.getByText(PREVIOUS_A.join('・'))).toBeVisible();
    await expect(row.getByText('桃井')).toBeVisible();
    await expect(row.getByText('21-12')).toBeVisible();
    await expect(row.getByRole('button', { name: '直す' })).toBeVisible();
    // 2 つ前の試合（桜井・梅田）は出さない
    await expect(courtCard(page, OLD_DONE_COURT).getByText('桜井')).toHaveCount(0);

    await context.close();
  });

  test('観戦者には「直す」「試合を終了する」が出ない。1つ前は見える', async ({ browser }) => {
    const { context, page } = await openCourts(browser, 'viewer');

    await expect(previousRow(page).getByText('21-12')).toBeVisible();
    await expect(page.getByRole('button', { name: '直す' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);

    await context.close();
  });

  test('次の試合が進行中でも「直す」で直し中に戻り、直した点が保存され、「もう一度終了する」で終了になる', async ({
    browser,
  }) => {
    const { context, page } = await openCourts(browser, 'player');

    await reopenPrevious(page);

    // データベースで、その試合が進行中に戻る
    await expect
      .poll(async () => (await findMatchResult(matchIds['newer-done']))?.status)
      .toBe('live');
    expect((await findMatchResult(matchIds['newer-done']))?.finishedAt).toBeNull();
    await expect(fixingPanel(page).getByText('直し中')).toBeVisible();
    await expect(previousRow(page)).toHaveCount(0);

    // 今の試合（楠田・榊原）はそのまま LIVE で、点も入れられる
    await expect(courtCard(page, OLD_DONE_COURT).getByText('LIVE')).toBeVisible();
    await plusButton(page, OLD_DONE_COURT, NEXT_LIVE_A).click();
    await expect
      .poll(() => findSavedGameScore(matchIds['older-next'], 1))
      .toEqual({ sideAScore: 2, sideBScore: 0 });

    // 直し中の試合の点を直す（杉本・柳田 21 → 22）
    await fixingPanel(page)
      .getByRole('button', { name: `${PREVIOUS_A.join('・')}の第1ゲームの得点を1増やす` })
      .click();
    await expect
      .poll(() => findSavedGameScore(matchIds['newer-done'], 1))
      .toEqual({ sideAScore: 22, sideBScore: 12 });

    // もう一度終了する
    await fixingPanel(page).getByRole('button', { name: 'もう一度終了する' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect
      .poll(async () => (await findMatchResult(matchIds['newer-done']))?.status)
      .toBe('done');
    expect((await findMatchResult(matchIds['newer-done']))?.finishedAt).not.toBeNull();

    await expect(fixingPanel(page)).toHaveCount(0);
    await expect(previousRow(page).getByText('22-12')).toBeVisible();
    // 今の試合は進行中のまま
    await expect(courtCard(page, OLD_DONE_COURT).getByText('LIVE')).toBeVisible();

    // 開き直しても同じ
    await page.reload();
    await expect(previousRow(page).getByText('22-12')).toBeVisible();

    await context.close();
  });

  test('片方で直すと、もう片方（観戦者）にも直し中が映り、もう一度終了すると1つ前に戻る', async ({
    browser,
  }) => {
    const player = await openCourts(browser, 'player');
    const viewer = await openCourts(browser, 'viewer');

    await reopenPrevious(player.page);

    await expect(fixingPanel(viewer.page).getByText('直し中')).toBeVisible({ timeout: 5000 });
    await expect(previousRow(viewer.page)).toHaveCount(0);
    // 観戦者には押すボタンが出ない
    await expect(fixingPanel(viewer.page).getByRole('button')).toHaveCount(0);

    await fixingPanel(player.page).getByRole('button', { name: 'もう一度終了する' }).click();
    await player.page.getByRole('button', { name: 'OK' }).click();

    await expect(previousRow(viewer.page).getByText('21-12')).toBeVisible({ timeout: 5000 });
    await expect(fixingPanel(viewer.page)).toHaveCount(0);
    expect(viewer.refreshes.count).toBe(0);

    await player.context.close();
    await viewer.context.close();
  });

  test('試合を終了すると、そのコートの1つ前に移り、「直す」で戻せる（次の試合は呼出待ちに残る）', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
    await takeScorer(courtCard(page, LIVE_COURT));

    await finishLiveCourtOn(page);

    const card = courtCard(page, LIVE_COURT);
    const row = page.getByTestId(`previous-match-${LIVE_COURT}`);
    await expect(row.getByText(LIVE_A.join('・'))).toBeVisible();
    await expect(row.getByText('5-3')).toBeVisible();
    await expect(card.getByText('呼出待ち')).toBeVisible();

    await row.getByRole('button', { name: '直す' }).click();
    await page.getByRole('button', { name: 'OK' }).click();

    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('live');
    await expect(page.getByTestId(`fixing-match-${LIVE_COURT}`).getByText('直し中')).toBeVisible();
    // 次の試合は呼出待ちのまま
    await expect(card.getByText('呼出待ち')).toBeVisible();

    await context.close();
  });

  test('取り消せなかったときは日本語の理由が出て、1つ前のまま', async ({ browser }) => {
    const { context, page } = await openCourts(browser, 'player');
    await page.route('**/api/matches/*/result', (route) => route.abort());

    await reopenPrevious(page);

    await expect(previousRow(page).getByRole('status')).toContainText('取り消せませんでした');
    await expect(fixingPanel(page)).toHaveCount(0);
    expect((await findMatchResult(matchIds['newer-done']))?.status).toBe('done');

    await context.close();
  });

  async function finishLiveCourtOn(page: Page) {
    await courtCard(page, LIVE_COURT).getByRole('button', { name: '試合を終了する' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');
  }

  for (const width of [375, 390]) {
    test(`${width}px 幅で、1つ前・直し中・案内が出た状態でも横にはみ出さない（長い名前・3 ゲーム）`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.goto('/courts');
      const card = courtCard(page, LONG_COURT);
      const previous = page.getByTestId(`previous-match-${LONG_COURT}`);
      await expect(previous).toBeVisible();

      async function expectNothingSticksOut(label: string) {
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(innerWidth, label).toBe(width);
        expect(scrollWidth, label).toBe(innerWidth);
        const stickingOut = await card.evaluate((element) => {
          const cardRect = element.getBoundingClientRect();
          return Array.from(element.querySelectorAll('*'))
            .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
            .filter(
              ({ rect }) =>
                rect.width > 0 &&
                (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5)
            )
            .map(({ text }) => text);
        });
        expect(stickingOut, label).toEqual([]);
      }

      // 1 つ前（3 ゲーム分の得点・長いペア名）
      await expect(previous.getByText('21-19')).toBeVisible();
      await expectNothingSticksOut('1つ前');

      // 直し中（得点の枠 3 つ）+ 取り消しの案内 + 今の試合
      await previous.getByRole('button', { name: '直す' }).click();
      // 確認画面は画面の下に固定で重なる（カードの外）ので、ダイアログの中ではみ出しを測る
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const dialogStickingOut = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('*'))
          .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
          .filter(
            ({ rect }) =>
              rect.width > 0 && (rect.right > box.right + 0.5 || rect.left < box.left - 0.5)
          )
          .map(({ text }) => text);
      });
      expect(dialogStickingOut).toEqual([]);
      const { scrollWidth: pageScrollWidth, innerWidth: pageInnerWidth } = await page.evaluate(
        () => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        })
      );
      expect(pageScrollWidth).toBe(pageInnerWidth);
      await page.getByRole('button', { name: 'OK' }).click();
      const fixing = page.getByTestId(`fixing-match-${LONG_COURT}`);
      await expect(fixing.getByText('直し中')).toBeVisible();
      await expectNothingSticksOut('直し中');

      // 点が送れないときの案内も加えて測る
      await page.route('**/api/matches/*/scores', (route) => route.abort());
      await fixing
        .getByRole('button', { name: '五十嵐　十四郎・長谷川 一二三の第1ゲームの得点を1増やす' })
        .click();
      await expect(fixing.getByRole('status')).toContainText('保存できていません');
      await expectNothingSticksOut('直し中 + 案内');

      await context.close();
    });
  }
});

/**
 * 棄権を記録する（docs/specs/2026-10-11-retire-match.md）。
 * コート 11 は 青山・赤坂（A）5-3 緑川・紫野（B）で、点数では A が勝っている。
 * A 側を棄権にして終了すると B の勝ちになる。
 */
test.describe('棄権で終了する', () => {
  const RETIRED_NOTE = `（${LIVE_A.join('・')} 棄権）`;

  async function openAsPlayer(browser: Browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await enterAsPlayer(page, '愛知南', 'たろう');
    await openCourtsAndWaitForLive(page);
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
    await takeScorer(courtCard(page, LIVE_COURT));
    return { context, page };
  }

  function previousRow(page: Page) {
    return page.getByTestId(`previous-match-${LIVE_COURT}`);
  }

  async function finishWithALeftRetired(page: Page) {
    await courtCard(page, LIVE_COURT).getByRole('button', { name: '試合を終了する' }).click();
    const dialog = page.getByRole('dialog');
    // 点数では A（青山・赤坂）が勝っているので、選ぶ前の勝ちは A
    await expect(dialog.getByText(/試合の勝ち/)).toContainText(LIVE_A.join('・'));
    await dialog.getByRole('button', { name: `${LIVE_A.join('・')}が棄権` }).click();
    await expect(dialog.getByText(/試合の勝ち/)).toContainText(LIVE_B.join('・'));
    await dialog.getByRole('button', { name: 'OK' }).click();
  }

  test('点数で勝っている A 側を棄権にして終了すると、B の勝ちで記録され、1つ前・他の画面・myページに映る', async ({
    browser,
  }) => {
    const mine = await openAsPlayer(browser);
    const viewer = await openAnotherBrowser(browser, 'viewer');

    await finishWithALeftRetired(mine.page);

    await expect
      .poll(async () => (await findMatchResult(matchIds.live))?.ending)
      .toBe('retired_side_a');
    // 自分の画面の 1 つ前
    await expect(previousRow(mine.page).getByText(/勝ち:/)).toContainText(LIVE_B.join('・'));
    await expect(previousRow(mine.page).getByText(RETIRED_NOTE)).toBeVisible();
    // 他のブラウザにも、その場で映る（開き直さない）
    await expect(previousRow(viewer.page).getByText(/勝ち:/)).toContainText(LIVE_B.join('・'), {
      timeout: 5000,
    });
    await expect(previousRow(viewer.page).getByText(RETIRED_NOTE)).toBeVisible();
    expect(viewer.refreshes.count).toBe(0);

    // 開き直しても（サーバーから読み直しても）同じ
    await viewer.page.reload();
    await expect(previousRow(viewer.page).getByText(RETIRED_NOTE)).toBeVisible();

    // 棄権した本人（青山）のマイページは負け、相手側（緑川）は勝ち
    const loser = await browser.newContext();
    const loserPage = await loser.newPage();
    await enterAsPlayer(loserPage, '愛知北', LIVE_A[0]);
    await loserPage.goto('/me');
    const loserCard = loserPage.getByText('予選 11回戦').locator('xpath=ancestor::li[1]');
    await expect(loserCard.getByRole('img', { name: '負け' })).toBeVisible();
    await expect(loserCard.getByText(RETIRED_NOTE)).toBeVisible();
    await loser.close();

    const winner = await browser.newContext();
    const winnerPage = await winner.newPage();
    await enterAsPlayer(winnerPage, '愛知西', LIVE_B[0]);
    await winnerPage.goto('/me');
    const winnerCard = winnerPage.getByText('予選 11回戦').locator('xpath=ancestor::li[1]');
    await expect(winnerCard.getByRole('img', { name: '勝ち' })).toBeVisible();
    await winner.close();

    // 対戦表の試合一覧は e2e/bracket.spec.ts で確かめる（この画面のシナリオは同じ組み合わせの対戦を
    // 足すので、星取表のマスにどの対戦が出るか決まらない）

    await mine.context.close();
    await viewer.context.close();
  });

  test('棄権を選ばずに終了すると、いままでどおり（棄権の印は付かない）', async ({ browser }) => {
    const mine = await openAsPlayer(browser);

    await courtCard(mine.page, LIVE_COURT).getByRole('button', { name: '試合を終了する' }).click();
    await mine.page.getByRole('button', { name: 'OK' }).click();

    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');
    expect((await findMatchResult(matchIds.live))?.ending).toBe('normal');
    await expect(mine.page.getByText(/棄権/)).toHaveCount(0);

    await mine.context.close();
  });

  test('「直す」で棄権の印が消え、もう一度終了するときに選び直せる', async ({ browser }) => {
    const mine = await openAsPlayer(browser);
    await finishWithALeftRetired(mine.page);
    await expect(previousRow(mine.page).getByText(RETIRED_NOTE)).toBeVisible();

    await previousRow(mine.page).getByRole('button', { name: '直す' }).click();
    await mine.page.getByRole('button', { name: 'OK' }).click();

    await expect.poll(async () => (await findMatchResult(matchIds.live))?.ending).toBe('normal');
    const fixing = mine.page.getByTestId(`fixing-match-${LIVE_COURT}`);
    await expect(fixing.getByText('直し中')).toBeVisible();
    await expect(mine.page.getByText(RETIRED_NOTE)).toHaveCount(0);

    // 選び直せる（前回の選択は残っていない）
    await fixing.getByRole('button', { name: 'もう一度終了する' }).click();
    const dialog = mine.page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: `${LIVE_A.join('・')}が棄権` })
    ).toHaveAttribute('aria-pressed', 'false');
    await dialog.getByRole('button', { name: `${LIVE_B.join('・')}が棄権` }).click();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect
      .poll(async () => (await findMatchResult(matchIds.live))?.ending)
      .toBe('retired_side_b');

    await mine.context.close();
  });

  /**
   * 自分が送った「終了」の知らせが、「直す」のあとに遅れて届く（体育館の弱い電波）。
   * 以前は、そのとき画面が一瞬「1つ前（棄権の印）」に戻り、「直し中」の枠が作り直されて、
   * 開いていた確認画面と選んでいた棄権が消えていた（docs/specs/2026-10-14-courts-stale-result.md）。
   * 手元では知らせが 0.3 秒で届くので、止めておいて、確認画面を開いてから流す。
   */
  test('「直す」のあと、確認画面を開いている間に古い「終了」の知らせが遅れて届いても、確認画面は閉じず、選んだ棄権も残る。ちらつかない。そのあとの他の人の変化は普通に映る', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const realtime = await holdRealtimeMatchChanges(page);
    await enterAsPlayer(page, '愛知南', 'たろう');
    await openCourtsAndWaitForLive(page);
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
    // 担当を取った知らせが先に届き終わってから止める（止めた数に、担当の知らせを混ぜない）
    await takeScorer(courtCard(page, LIVE_COURT));
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .not.toBeNull();
    await waitUntilEarlierChangesArrive(page, 29);

    // ここから先の「終了」「取り消し」の知らせは、画面に届かない
    realtime.hold();
    await finishWithALeftRetired(page);
    await expect(previousRow(page).getByText(RETIRED_NOTE)).toBeVisible();
    await previousRow(page).getByRole('button', { name: '直す' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    const fixing = page.getByTestId(`fixing-match-${LIVE_COURT}`);
    await expect(fixing.getByText('直し中')).toBeVisible();

    // 確認画面を開いて、B を棄権にしてある
    await fixing.getByRole('button', { name: 'もう一度終了する' }).click();
    const dialog = page.getByRole('dialog');
    const retireB = dialog.getByRole('button', { name: `${LIVE_B.join('・')}が棄権` });
    await retireB.click();
    await expect(retireB).toHaveAttribute('aria-pressed', 'true');

    // 流す前から「1つ前」を見張る（一瞬でも出たら記録する）
    await page.evaluate((testId) => {
      const seen = { previousAppeared: false };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      new MutationObserver(() => {
        if (document.querySelector(`[data-testid="${testId}"]`)) seen.previousAppeared = true;
      }).observe(document, { subtree: true, childList: true });
    }, `previous-match-${LIVE_COURT}`);

    // 止めていた「終了」「取り消し」の知らせ（古い）を流す。流した知らせより後ろに届く
    // 別のコートの点が映れば、古い知らせも当て終わっている
    await expect.poll(() => realtime.heldCount()).toBe(2);
    realtime.release();
    await waitUntilEarlierChangesArrive(page, 31);

    await expect(dialog).toBeVisible();
    await expect(retireB).toHaveAttribute('aria-pressed', 'true');
    await expect(fixing).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __seen: { previousAppeared: boolean } }).__seen.previousAppeared
      )
    ).toBe(false);

    // そのまま OK で、選んだ棄権で記録される
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect
      .poll(async () => (await findMatchResult(matchIds.live))?.ending)
      .toBe('retired_side_b');
    await expect(previousRow(page).getByText(`（${LIVE_B.join('・')} 棄権）`)).toBeVisible();

    // 自分の送った状態が戻ってきたあとは、ほかの人の変化が普通に映る（待ちっぱなしにならない）
    await reopenMatchDirectly(matchIds.live);
    await expect(fixing.getByText('直し中')).toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test('観戦者には棄権を選ぶ欄が出ない', async ({ browser }) => {
    const viewer = await openAnotherBrowser(browser, 'viewer');

    await expect(viewer.page.getByRole('button', { name: /棄権/ })).toHaveCount(0);
    await expect(viewer.page.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);

    await viewer.context.close();
  });

  test('棄権した側が A / B 以外の終了は 400 と日本語の理由で断られ、記録されない', async ({
    browser,
  }) => {
    const mine = await openAsPlayer(browser);

    // 入場済みの cookie を使って、入口へ直接送る（画面からは A / B 以外を送れないため）
    const response = await mine.page.request.post(`/api/matches/${matchIds.live}/result`, {
      data: { retiredSide: 'C' },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain('棄権した側は A か B で指定してください。');
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');

    await mine.context.close();
  });

  test('同点のときは、棄権を選ぶ画面に進まず止まる', async ({ browser }) => {
    await writeGameScoreDirectly(matchIds.live, 1, 8, 8);
    const mine = await openAsPlayer(browser);

    await courtCard(mine.page, LIVE_COURT).getByRole('button', { name: '試合を終了する' }).click();

    await expect(mine.page.getByRole('dialog')).toHaveCount(0);
    await expect(mine.page.getByText('同点では終了できません')).toBeVisible();

    await mine.context.close();
  });

  for (const width of [375, 390]) {
    test(`${width}px 幅で、確認画面の棄権の欄が横にはみ出さない（長い名前・3 ゲーム）`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.goto('/courts');
      await takeScorer(courtCard(page, LONG_COURT));
      await courtCard(page, LONG_COURT).getByRole('button', { name: '試合を終了する' }).click();
      const dialog = page.getByRole('dialog');
      const retireButton = dialog.getByRole('button', { name: /棄権/ }).first();
      await expect(retireButton).toBeVisible();
      await retireButton.click();

      const { stickingOut, buttonHeights } = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          stickingOut: Array.from(element.querySelectorAll('*'))
            .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
            .filter(
              ({ rect }) =>
                rect.width > 0 && (rect.right > box.right + 0.5 || rect.left < box.left - 0.5)
            )
            .map(({ text }) => text),
          buttonHeights: Array.from(element.querySelectorAll('button[aria-pressed]')).map(
            (button) => button.getBoundingClientRect().height
          ),
        };
      });
      expect(stickingOut).toEqual([]);
      // 片手・汗ばんだ指でも押せる大きさ（44px 以上）
      expect(buttonHeights).toHaveLength(2);
      for (const height of buttonHeights) expect(height).toBeGreaterThanOrEqual(44);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth).toBe(width);
      expect(scrollWidth).toBe(innerWidth);

      await context.close();
    });
  }
});

/**
 * 入口に断られた点の後始末。断られた点はもう送らないので、画面はサーバーの点に戻し、
 * 古い「断られた」の印で終了を止め続けない（PR #66 レビュー）。
 * 「他の人が先に終了した」を待ち合わせなしで起こすため、入口の返事を 409 に差し替える。
 */
test.describe('入口に断られた点', () => {
  const SCORES_URL = '**/api/matches/*/scores';

  async function pressRejectedPlus(page: Page) {
    await page.route(SCORES_URL, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: '終了した試合です。' }),
      })
    );
    await plusButton(page, LIVE_COURT, LIVE_A).click();
    await expect(courtCard(page, LIVE_COURT).getByRole('status')).toContainText('終了した試合です');
    await page.unroute(SCORES_URL);
  }

  test('断られたら画面はサーバーの点に戻り、次に押した点はサーバーの点から数える', async ({
    browser,
  }) => {
    const mine = await openAnotherBrowser(browser, 'player');
    const card = courtCard(mine.page, LIVE_COURT);

    // サーバーは 5-3。押した 6 は断られる
    await pressRejectedPlus(mine.page);
    await expect(card.getByText('5', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(card.getByText('6', { exact: true })).toHaveCount(0);

    // 次に押すと、断られた 6 からではなく 5 から数えて 6 が保存される
    await plusButton(mine.page, LIVE_COURT, LIVE_A).click();
    await expect
      .poll(() => findSavedGameScore(matchIds.live, 1))
      .toEqual({ sideAScore: 6, sideBScore: 3 });

    await mine.context.close();
  });

  test('断られたあと、その試合が終了されて取り消されたら、もう一度終了できる', async ({
    browser,
  }) => {
    const mine = await openAnotherBrowser(browser, 'player');

    await pressRejectedPlus(mine.page);

    // 他の人が終了し、さらに「直す」で取り消した
    await finishMatchDirectly(matchIds.live);
    await expect(mine.page.getByTestId(`previous-match-${LIVE_COURT}`)).toBeVisible({
      timeout: 5000,
    });
    await reopenMatchDirectly(matchIds.live);
    const fixing = mine.page.getByTestId(`fixing-match-${LIVE_COURT}`);
    await expect(fixing.getByText('直し中')).toBeVisible({ timeout: 5000 });

    // 古い「断られた」の印で止まらず、終了が記録される
    await fixing.getByRole('button', { name: 'もう一度終了する' }).click();
    await mine.page.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');

    await mine.context.close();
  });
});
