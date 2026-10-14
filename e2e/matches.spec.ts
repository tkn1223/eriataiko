import { expect, test, type Browser, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import {
  addLiveMatchLater,
  createMatchesScenario,
  deleteMatchesScenario,
  writeGameScoreDirectly,
} from './helpers/courts-scenario';

/**
 * /matches（進行表）の画面確認。見るだけの画面で、本物の試合を出し、
 * 結果LIVE で起きたこと（点・終了）をその場で映す。
 *
 * 試合は `createMatchesScenario` が作るテスト用のもの。seed の試合（コート 1）には頼らず、
 * `is_current` も触らない。テストごとに作り直し、最後に消す。
 * 2 台のブラウザ（Playwright の context を 2 つ）で、結果LIVE → 進行表への映りを確かめる。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

/** コート 9・10 は「数として並ぶ（9 の次が 10）」、13 は誰も使わない飛び番号。 */
const WAIT_9_COURT = 9;
const WAIT_10_COURT = 10;
const LIVE_COURT = 11;
const FINISHED_COURT = 12;
const SKIPPED_COURT = 13;
const LONG_COURT = 14;

const WAIT_9_A = ['九条', '九鬼'];
const WAIT_9_B = ['九谷', '九里'];
const WAIT_10_A = ['十河', '十時'];
const WAIT_10_B = ['十川', '十倉'];
const DONE_A = ['青山', '赤坂'];
const DONE_B = ['緑川', '紫野'];
const LIVE_A = ['金子', '銀林'];
const LIVE_B = ['銅谷', '鉄井'];
const NEXT_A = ['白石', '黒田'];
const NEXT_B = ['茶谷', '灰原'];
const RETIRED_A = ['桜井', '梅田'];
const RETIRED_B = ['松本', '竹内'];
const OTHER_DONE_A = ['杉本', '柳田'];
const OTHER_DONE_B = ['桃井', '栗原'];
const LONG_DONE_A = ['五十嵐　十四郎', '長谷川 一二三'];
const LONG_DONE_B = ['佐々木 太郎', '小早川　日下部'];
const LONG_LIVE_A = ['久我山　三千代', '宇都宮 四郎兵衛'];
const LONG_LIVE_B = ['志賀島　五郎', '大和田 六郎太'];
const UNDECIDED_A = ['楠田', '榊原'];
const UNDECIDED_B = ['椎名', '樫村'];

let matchIds: Record<string, string>;

/**
 * テスト用の試合が、前のテストで書き換えられたか。書き換えられたときだけ作り直す。
 *
 * 毎回作り直すと、消す・作るたびに試合と点の変化が Realtime から届き、手元の Realtime の
 * 「1 秒あたりの知らせの上限」（100）を超える。超えると Realtime はしばらく知らせを止め、
 * 次の 2 台のブラウザのテストで、押した点が進行表に届かず落ちる
 * （`MessagePerSecondRateLimitReached` が Realtime の記録に出ていた。全体を流すと 2 回に 1 回ほど落ちた）。
 * 点や終了を書き換えるテストは、`markScenarioChanged()` で次のテストに作り直しを頼む。
 * テストが落ちると Playwright は続きを新しい作業場所（worker）で流し、この変数も初めの値に戻るので、
 * そのときも作り直される。
 */
let scenarioChanged = true;

function markScenarioChanged() {
  scenarioChanged = true;
}

test.beforeEach(async () => {
  if (!scenarioChanged) return;
  scenarioChanged = false;
  matchIds = await createMatchesScenario([
    {
      key: 'wait9',
      courtNumber: WAIT_9_COURT,
      orderInCourt: 1,
      status: 'waiting',
      maxGameCount: 1,
      roundName: '予選 21回戦',
      scores: [],
      teamA: [WAIT_9_A[0], WAIT_9_A[1]],
      teamB: [WAIT_9_B[0], WAIT_9_B[1]],
    },
    {
      key: 'wait10',
      courtNumber: WAIT_10_COURT,
      orderInCourt: 1,
      status: 'waiting',
      maxGameCount: 1,
      roundName: '予選 22回戦',
      scores: [],
      teamA: [WAIT_10_A[0], WAIT_10_A[1]],
      teamB: [WAIT_10_B[0], WAIT_10_B[1]],
    },
    {
      key: 'done',
      courtNumber: LIVE_COURT,
      orderInCourt: 1,
      status: 'done',
      finishedMinutesAgo: 30,
      maxGameCount: 1,
      roundName: '予選 23回戦',
      scores: [[21, 15]],
      teamA: [DONE_A[0], DONE_A[1]],
      teamB: [DONE_B[0], DONE_B[1]],
    },
    {
      key: 'live',
      courtNumber: LIVE_COURT,
      orderInCourt: 2,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 24回戦',
      scores: [[5, 3]],
      teamA: [LIVE_A[0], LIVE_A[1]],
      teamB: [LIVE_B[0], LIVE_B[1]],
    },
    {
      key: 'next',
      courtNumber: LIVE_COURT,
      orderInCourt: 3,
      status: 'waiting',
      maxGameCount: 1,
      roundName: '予選 25回戦',
      scores: [],
      teamA: [NEXT_A[0], NEXT_A[1]],
      teamB: [NEXT_B[0], NEXT_B[1]],
    },
    {
      // 点数では A 側が圧勝だが、A 側が棄権 → B 側の勝ち
      key: 'retired',
      courtNumber: FINISHED_COURT,
      orderInCourt: 1,
      status: 'done',
      ending: 'retired_side_a',
      finishedMinutesAgo: 20,
      maxGameCount: 1,
      roundName: '予選 26回戦',
      scores: [[21, 5]],
      teamA: [RETIRED_A[0], RETIRED_A[1]],
      teamB: [RETIRED_B[0], RETIRED_B[1]],
    },
    {
      key: 'other-done',
      courtNumber: FINISHED_COURT,
      orderInCourt: 2,
      status: 'done',
      finishedMinutesAgo: 10,
      maxGameCount: 1,
      roundName: '予選 27回戦',
      scores: [[15, 21]],
      teamA: [OTHER_DONE_A[0], OTHER_DONE_A[1]],
      teamB: [OTHER_DONE_B[0], OTHER_DONE_B[1]],
    },
    {
      // 空白入りの長い名前・3 ゲーム（375px でいちばん詰まる形）
      key: 'long-done',
      courtNumber: LONG_COURT,
      orderInCourt: 1,
      status: 'done',
      finishedMinutesAgo: 5,
      maxGameCount: 3,
      roundName: '決勝トーナメント 準決勝',
      scores: [
        [21, 19],
        [18, 21],
        [21, 20],
      ],
      teamA: [LONG_DONE_A[0], LONG_DONE_A[1]],
      teamB: [LONG_DONE_B[0], LONG_DONE_B[1]],
    },
    {
      key: 'long-live',
      courtNumber: LONG_COURT,
      orderInCourt: 2,
      status: 'live',
      maxGameCount: 3,
      roundName: '決勝トーナメント 決勝',
      scores: [
        [21, 19],
        [18, 21],
        [20, 20],
      ],
      teamA: [LONG_LIVE_A[0], LONG_LIVE_A[1]],
      teamB: [LONG_LIVE_B[0], LONG_LIVE_B[1]],
    },
    {
      key: 'undecided',
      courtNumber: null,
      orderInCourt: null,
      status: 'waiting',
      maxGameCount: 1,
      roundName: '予選 28回戦',
      scores: [],
      teamA: [UNDECIDED_A[0], UNDECIDED_A[1]],
      teamB: [UNDECIDED_B[0], UNDECIDED_B[1]],
    },
  ]);
});

test.afterAll(deleteMatchesScenario);

// 見出しの文字列は区切りの空白を挟まず連結される（例: 「コート1現在3試合目残り4試合」）。
// 「コート1」の直後に別の数字が続かないことだけを見て、他のコート番号と区別する。
function courtHeading(page: Page, courtNumber: number) {
  return page.getByRole('button', { name: new RegExp(`^コート${courtNumber}(?!\\d)`) });
}

function undecidedHeading(page: Page) {
  return page.getByRole('button', { name: /^コート未定/ });
}

function row(page: Page, key: string) {
  return page.getByTestId(`match-row-${matchIds[key]}`);
}

async function openCourt(page: Page, courtNumber: number) {
  const heading = courtHeading(page, courtNumber);
  if ((await heading.getAttribute('aria-expanded')) !== 'true') await heading.click();
}

/** 画面全体の読み直し（router.refresh）か。読み直すと `/matches?_rsc=...` が飛ぶ。 */
function isMatchesRefresh(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname === '/matches' && parsed.searchParams.has('_rsc');
}

/** 読み直し（router.refresh）の回数を、呼んだ時点から数える。 */
function countRefreshes(page: Page) {
  const state = { count: 0 };
  page.on('request', (request) => {
    if (isMatchesRefresh(request.url())) state.count += 1;
  });
  return state;
}

/**
 * 進行表を開き、購読がつながるまで待つ。
 * 購読は、つながる前の変化を届けないので、画面はつながったときに 1 回だけ読み直す。
 * その読み直しの返事を「つながった」の合図にする（時間を決めて待たない）。
 * 戻り値は、そのあとの読み直しの回数（最初の 1 回は数えない）。
 */
async function openMatchesAndWaitForLive(page: Page) {
  const caughtUp = page.waitForResponse((response) => isMatchesRefresh(response.url()));
  await page.goto('/matches');
  await caughtUp;
  return countRefreshes(page);
}

async function openMatchesAs(browser: Browser, as: 'viewer' | 'player') {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (as === 'viewer') await enterAsViewer(page);
  else await enterAsPlayer(page, '愛知北', LIVE_A[0]);
  const refreshes = await openMatchesAndWaitForLive(page);
  await expect(courtHeading(page, LIVE_COURT)).toBeVisible();
  return { context, page, refreshes };
}

// ---------------------------------------------------------------------
// 画面の中身（観戦者）
// ---------------------------------------------------------------------

test.describe('本物の試合が出る', () => {
  test.beforeEach(async ({ page }) => {
    await enterAsViewer(page);
  });

  test('試合順・部・両ペアの名前・点数が出て、進行中の行には LIVE が出る。見本の名前は出ない', async ({
    page,
  }) => {
    await page.goto('/matches');
    await openCourt(page, LIVE_COURT);

    const live = row(page, 'live');
    await expect(live).toContainText('2試合目');
    await expect(live).toContainText('1部');
    await expect(live).toContainText(LIVE_A.join('・'));
    await expect(live).toContainText(LIVE_B.join('・'));
    await expect(live).toContainText('5-3');
    await expect(live).toContainText('LIVE');
    await expect(row(page, 'next')).toContainText('3試合目');
    await expect(row(page, 'next')).not.toContainText('LIVE');

    // 見本データ（sample-data.ts）にあった名前は出ない
    await expect(page.getByText(/須藤|柳田・斉藤|増田/)).toHaveCount(0);
  });

  test('コートのカードは試合のあるコートだけ番号順（9 の次が 10）。飛び番号は出ず、コート未定は最後', async ({
    page,
  }) => {
    await page.goto('/matches');
    await expect(courtHeading(page, LIVE_COURT)).toBeVisible();

    const labels = (
      await page
        .getByRole('button', { name: /^コート/ })
        .evaluateAll((buttons) =>
          buttons.map((button) => /^コート(\d+|未定)/.exec(button.textContent ?? '')?.[1] ?? '?')
        )
    ).filter((label) => label !== '?');

    // 未定は最後。それ以外は数として昇順（文字の順なら 10 が 9 より前に来る）
    expect(labels.at(-1)).toBe('未定');
    const numbers = labels.slice(0, -1).map(Number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    for (const court of [WAIT_9_COURT, WAIT_10_COURT, LIVE_COURT, FINISHED_COURT, LONG_COURT]) {
      expect(numbers).toContain(court);
    }
    expect(numbers.indexOf(WAIT_9_COURT)).toBeLessThan(numbers.indexOf(WAIT_10_COURT));
    // 試合が無い番号は、番号が飛んだまま出ない
    await expect(courtHeading(page, SKIPPED_COURT)).toHaveCount(0);
  });

  test('コート未定の試合は、最後の「コート未定」の中に出る', async ({ page }) => {
    await page.goto('/matches');
    await undecidedHeading(page).click();

    const undecided = row(page, 'undecided');
    await expect(undecided).toContainText(UNDECIDED_A.join('・'));
    await expect(undecided).toContainText('順番未定');
    // seed にもコートが決まっていない試合があるので、数は決めつけず「残り」が出ることだけ見る
    await expect(undecidedHeading(page)).toContainText(/残り\d+試合/);
  });

  test('見出しの「現在◯試合目」「残り◯試合」「すべて終了」が試合の状態どおりに出る', async ({
    page,
  }) => {
    await page.goto('/matches');

    // 終了 1・進行中 1・これから 1 → 進行中も残りに数えて 2 試合
    await expect(courtHeading(page, LIVE_COURT)).toContainText('現在2試合目');
    await expect(courtHeading(page, LIVE_COURT)).toContainText('残り2試合');
    await expect(courtHeading(page, WAIT_9_COURT)).toContainText('残り1試合');
    await expect(courtHeading(page, WAIT_9_COURT)).not.toContainText('現在');
    await expect(courtHeading(page, FINISHED_COURT)).toContainText('すべて終了');
  });

  test('見出しを押すと中身が開いたり閉じたりする', async ({ page }) => {
    await page.goto('/matches');
    const heading = courtHeading(page, LIVE_COURT);
    await expect(heading).toHaveAttribute('aria-expanded', 'false');

    await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'live')).toBeVisible();

    await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'false');
  });

  test('終わった試合は最初は隠れていて、「✓ 終了した◯試合を見る」を押すと出る', async ({
    page,
  }) => {
    await page.goto('/matches');
    await openCourt(page, LIVE_COURT);

    await expect(row(page, 'done')).toHaveCount(0);

    await page.getByRole('button', { name: '✓ 終了した1試合を見る' }).click();
    await expect(row(page, 'done')).toBeVisible();
    await expect(row(page, 'done')).toContainText('21-15');
    await expect(page.getByRole('button', { name: '✓ 終了した1試合を隠す' })).toBeVisible();
  });

  test('勝った側が太字になる。棄権の試合は点数に関係なく相手が太字になり、「棄権」の印が出る', async ({
    page,
  }) => {
    await page.goto('/matches');
    await openCourt(page, FINISHED_COURT);
    await page.getByRole('button', { name: '✓ 終了した2試合を見る' }).click();

    // 普通の試合: 15-21 で B 側（桃井・栗原）の勝ち
    const normal = row(page, 'other-done');
    await expect(normal.getByText(OTHER_DONE_B.join('・'), { exact: true })).toHaveClass(
      /font-black/
    );
    await expect(normal.getByText(OTHER_DONE_A.join('・'), { exact: true })).not.toHaveClass(
      /font-black/
    );
    await expect(normal).not.toContainText('棄権');

    // 棄権: 21-5 で A 側が勝っているが、A 側が棄権 → B 側の勝ち
    const retired = row(page, 'retired');
    await expect(retired).toContainText('21-5');
    await expect(retired.getByText(RETIRED_B.join('・'), { exact: true })).toHaveClass(
      /font-black/
    );
    await expect(retired.getByText(RETIRED_A.join('・'), { exact: true })).not.toHaveClass(
      /font-black/
    );
    await expect(retired).toContainText(`（${RETIRED_A.join('・')} 棄権）`);
  });

  test('進行中の行を押しても何も起きない（得点入力は出ない）。「まだ保存されません」の帯も出ない', async ({
    page,
  }) => {
    await page.goto('/matches');
    await openCourt(page, LIVE_COURT);

    const live = row(page, 'live');
    await expect(live.getByRole('button')).toHaveCount(0);
    await live.click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /＋1|−1/ })).toHaveCount(0);
    await expect(page.getByText(/まだ保存されません/)).toHaveCount(0);
  });

  test('観戦者には「全試合」だけが出て、「自分の試合」も「あなたの試合」の印も出ない', async ({
    page,
  }) => {
    await page.goto('/matches');
    await openCourt(page, LIVE_COURT);

    await expect(page.getByRole('button', { name: '全試合' })).toBeVisible();
    await expect(page.getByRole('button', { name: '自分の試合' })).toHaveCount(0);
    await expect(page.getByText('あなたの試合')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------
// 選手として入った人
// ---------------------------------------------------------------------

test.describe('選手として入った人', () => {
  test.beforeEach(async ({ page }) => {
    // LIVE_A[0] は 'live' の試合にだけ出る
    await enterAsPlayer(page, '愛知北', LIVE_A[0]);
  });

  test('「全試合」「自分の試合」が出て、「自分の試合」で自分の出る試合だけになる', async ({
    page,
  }) => {
    await page.goto('/matches');

    await expect(page.getByRole('button', { name: '全試合' })).toBeVisible();
    await expect(page.getByRole('button', { name: '自分の試合' })).toBeVisible();
    await expect(courtHeading(page, FINISHED_COURT)).toBeVisible();

    await page.getByRole('button', { name: '自分の試合' }).click();

    // 自分の試合があるコートだけが残る
    await expect(courtHeading(page, LIVE_COURT)).toBeVisible();
    await expect(courtHeading(page, FINISHED_COURT)).toHaveCount(0);
    await expect(courtHeading(page, WAIT_9_COURT)).toHaveCount(0);
    // 見出しはコート全体の進み具合のまま
    await expect(courtHeading(page, LIVE_COURT)).toContainText('現在2試合目');
    await expect(courtHeading(page, LIVE_COURT)).toContainText('残り2試合');

    // 中も自分の試合だけ
    await openCourt(page, LIVE_COURT);
    await expect(row(page, 'live')).toBeVisible();
    await expect(row(page, 'next')).toHaveCount(0);

    await page.getByRole('button', { name: '全試合' }).click();
    await expect(courtHeading(page, FINISHED_COURT)).toBeVisible();
  });

  test('自分の試合には「あなたの試合」の印が出て、ほかの試合には出ない', async ({ page }) => {
    await page.goto('/matches');
    await openCourt(page, LIVE_COURT);

    await expect(row(page, 'live')).toContainText('あなたの試合');
    await expect(row(page, 'next')).not.toContainText('あなたの試合');
  });
});

// ---------------------------------------------------------------------
// 2 台のブラウザ: 結果LIVE の操作が、開き直さなくても進行表に映る
// ---------------------------------------------------------------------

test.describe('結果LIVE の操作が、別のブラウザの進行表にその場で映る', () => {
  // 点・終了・試合を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  function courtCard(page: Page, courtNumber: number) {
    return page.getByTestId(`court-card-${courtNumber}`);
  }

  /** 結果LIVE を開く側。seed の選手として入り、購読がつながるまで待つ。 */
  async function openCourtsAsPlayer(browser: Browser) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await enterAsPlayer(page, '愛知南', 'たろう');
    const caughtUp = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/courts' && url.searchParams.has('_rsc');
    });
    await page.goto('/courts');
    await caughtUp;
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
    return { context, page };
  }

  function plusButton(page: Page, names: string[]) {
    return courtCard(page, LIVE_COURT).getByRole('button', {
      name: `${names.join('・')}の第1ゲームの得点を1増やす`,
    });
  }

  test('結果LIVE で ＋ を押すと、別のブラウザで開いている進行表に数秒で同じ点数が出る（開き直さない）', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await openCourt(watcher.page, LIVE_COURT);
    await expect(row(watcher.page, 'live')).toContainText('5-3');
    const operator = await openCourtsAsPlayer(browser);

    await plusButton(operator.page, LIVE_A).click();

    await expect(row(watcher.page, 'live')).toContainText('6-3', { timeout: 5000 });
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('結果LIVE で試合を終了すると、進行表のそのコートの「現在◯試合目」「残り◯試合」が変わる', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await expect(courtHeading(watcher.page, LIVE_COURT)).toContainText('現在2試合目');
    await expect(courtHeading(watcher.page, LIVE_COURT)).toContainText('残り2試合');
    const operator = await openCourtsAsPlayer(browser);

    await courtCard(operator.page, LIVE_COURT)
      .getByRole('button', { name: '試合を終了する' })
      .click();
    await operator.page.getByRole('button', { name: 'OK' }).click();

    await expect(courtHeading(watcher.page, LIVE_COURT)).toContainText('残り1試合', {
      timeout: 5000,
    });
    await expect(courtHeading(watcher.page, LIVE_COURT)).not.toContainText('現在');
    // 終了した試合に数えられ、勝った側（A 側）が太字になる
    await openCourt(watcher.page, LIVE_COURT);
    await watcher.page.getByRole('button', { name: '✓ 終了した2試合を見る' }).click();
    await expect(
      row(watcher.page, 'live').getByText(LIVE_A.join('・'), { exact: true })
    ).toHaveClass(/font-black/);
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('点が変わるたびに進行表全体を読み直していない（つながったときの 1 回のあと、10 回押しても 0 回）', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await openCourt(watcher.page, LIVE_COURT);
    await openCourt(watcher.page, LONG_COURT);
    const operator = await openCourtsAsPlayer(browser);

    for (let press = 0; press < 10; press += 1) {
      await plusButton(operator.page, LIVE_A).click();
    }

    await expect(row(watcher.page, 'live')).toContainText('15-3', { timeout: 8000 });
    // 先に書いた変化が届き終わったことを、あとから別のコートに書いた点が映ることで確かめる
    await writeGameScoreDirectly(matchIds['long-live'], 1, 30, 0);
    await expect(row(watcher.page, 'long-live')).toContainText('30-0', { timeout: 5000 });
    // 読み直しは頼まれてから最長で最小の間隔（3 秒）待って走る。開いてすぐ押すと、
    // 点のたびに読み直す作りでも、まだ走っていないだけで 0 回に見えてしまう（実際にすり抜けた）。
    // 「起きない」ことは、待つ以外に確かめようがない
    await watcher.page.waitForTimeout(3500);
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('手元に無い試合の変化が続けて届いても、読み直しは 1 回。読み直すと新しい試合が出る', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await openCourt(watcher.page, WAIT_9_COURT);
    await expect(courtHeading(watcher.page, WAIT_9_COURT)).toContainText('残り1試合');

    // 画面を開いたあとにできた試合が始まった（手元に無い）。続けて点も入る
    const lateMatchId = await addLiveMatchLater(matchIds.wait9, WAIT_9_COURT, 2);
    await writeGameScoreDirectly(lateMatchId, 1, 1, 0);
    await writeGameScoreDirectly(lateMatchId, 1, 2, 0);

    await expect(courtHeading(watcher.page, WAIT_9_COURT)).toContainText('残り2試合', {
      timeout: 8000,
    });
    await expect(watcher.page.getByTestId(`match-row-${lateMatchId}`)).toContainText('LIVE');
    await expect(courtHeading(watcher.page, WAIT_9_COURT)).toContainText('現在2試合目');
    // 2 回目が走らないことは、読み直しの最小の間隔（3 秒）を過ぎるまで見る。
    // 「起きない」ことは、待つ以外に確かめようがない
    await watcher.page.waitForTimeout(3500);
    expect(watcher.refreshes.count).toBe(1);

    await watcher.context.close();
  });
});

// ---------------------------------------------------------------------
// 結果LIVE と進行表を行き来する（購読はアプリ全体で 1 本）
// ---------------------------------------------------------------------

/** Realtime の 1 通（`[join_ref, ref, topic, event, payload]` の形。古い形のオブジェクトも読む）。 */
function parseRealtimeFrame(
  frame: string | Buffer
): { ref: string | null; topic: string; event: string; status: unknown } | null {
  if (typeof frame !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(frame);
    if (Array.isArray(parsed)) {
      const [, ref, topic, event, payload] = parsed as [
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
      ];
      if (typeof topic !== 'string' || typeof event !== 'string') return null;
      const status = (payload as { status?: unknown } | null)?.status;
      return { ref: typeof ref === 'string' ? ref : null, topic, event, status };
    }
    const message = parsed as {
      ref?: unknown;
      topic?: unknown;
      event?: unknown;
      payload?: unknown;
    };
    if (typeof message.topic !== 'string' || typeof message.event !== 'string') return null;
    return {
      ref: typeof message.ref === 'string' ? message.ref : null,
      topic: message.topic,
      event: message.event,
      status: (message.payload as { status?: unknown } | null)?.status,
    };
  } catch {
    return null;
  }
}

/**
 * この画面が Supabase とつないでいる購読（`use-live-updates.ts` の `courts-live-◯`）を、
 * WebSocket の中身から数える。つないだ（参加の返事が ok）ら足し、離れた・通信が閉じたら引く。
 * 画面の中の作りに頼らず、外から見て「同時に何本つながっているか」を確かめるため。
 */
function trackLiveChannels(page: Page) {
  const joined = new Set<string>();
  const finished = new Set<string>();
  const topicByJoinRef = new Map<string, string>();
  let lastJoinedTopic: string | null = null;

  page.on('websocket', (socket) => {
    if (!/\/realtime\/v1\/websocket/.test(socket.url())) return;
    const topicsOfThisSocket = new Set<string>();

    socket.on('framesent', ({ payload }) => {
      const message = parseRealtimeFrame(payload);
      if (!message?.topic.startsWith('realtime:courts-live-')) return;
      if (message.event === 'phx_join' && message.ref) {
        topicByJoinRef.set(message.ref, message.topic);
        topicsOfThisSocket.add(message.topic);
      }
      if (message.event === 'phx_leave') {
        finished.add(message.topic);
        joined.delete(message.topic);
      }
    });
    socket.on('framereceived', ({ payload }) => {
      const message = parseRealtimeFrame(payload);
      if (message?.event !== 'phx_reply' || !message.ref || message.status !== 'ok') return;
      const topic = topicByJoinRef.get(message.ref);
      if (!topic || finished.has(topic)) return;
      joined.add(topic);
      lastJoinedTopic = topic;
    });
    socket.on('close', () => {
      for (const topic of topicsOfThisSocket) {
        finished.add(topic);
        joined.delete(topic);
      }
    });
  });

  return {
    /** いまつながっている購読の名前。 */
    joinedTopics: () => [...joined],
    lastJoinedTopic: () => lastJoinedTopic,
  };
}

test.describe('結果LIVE と進行表を行き来する', () => {
  // 点・終了・試合を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  test('行き来を繰り返しても、つながっている購読は常に 1 本。戻った進行表にも点がその場で映る', async ({
    page,
  }) => {
    const channels = trackLiveChannels(page);
    await enterAsViewer(page);
    await page.goto('/matches');
    await expect(courtHeading(page, LIVE_COURT)).toBeVisible();
    // 開発サーバーだけが左下に出す Next.js のバッジが「結果LIVE」を覆って押せなくするので隠す
    // （e2e/courts.spec.ts の goToTab と同じ。画面を移ってもこの指定は残る）
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

    /**
     * 下のメニューで画面を移り、その画面の購読がつながるまで待つ。
     * 離れた画面の購読は止まり、移った先の 1 本だけがつながっていることを確かめる。
     */
    async function moveTo(label: string, shown: () => Promise<void>) {
      const before = channels.lastJoinedTopic();
      await page.getByRole('navigation', { name: 'メインメニュー' }).getByText(label).click();
      await shown();
      await expect
        .poll(() => {
          const topics = channels.joinedTopics();
          return topics.length === 1 && topics[0] !== before ? 'つながった' : topics.join(',');
        })
        .toBe('つながった');
    }

    await expect.poll(() => channels.joinedTopics().length).toBe(1);
    for (let round = 0; round < 3; round += 1) {
      await moveTo('結果LIVE', () =>
        expect(page.getByTestId(`court-card-${LIVE_COURT}`)).toBeVisible()
      );
      await moveTo('進行表', () => expect(courtHeading(page, LIVE_COURT)).toBeVisible());
    }

    await expect(page.getByTestId('live-down-notice')).toHaveCount(0);
    await openCourt(page, LIVE_COURT);
    await writeGameScoreDirectly(matchIds.live, 1, 7, 3);
    await expect(row(page, 'live')).toContainText('7-3', { timeout: 5000 });
    expect(channels.joinedTopics()).toHaveLength(1);
  });
});

/** Supabase の Realtime の通信（WebSocket）を、テストの中で切ったり戻したりする。 */
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

// ---------------------------------------------------------------------
// 自動更新が途切れたとき
// ---------------------------------------------------------------------

test.describe('自動更新が途切れたとき', () => {
  // 点・終了・試合を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  test('「自動更新が止まっています」が出て、つながると消えて 1 回だけ読み直し、途切れている間の点が出る', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const realtime = await controlRealtimeSocket(page);
    await enterAsViewer(page);
    const refreshes = await openMatchesAndWaitForLive(page);
    await openCourt(page, LIVE_COURT);
    await expect(row(page, 'live')).toContainText('5-3');

    realtime.cut();
    await expect(page.getByTestId('live-down-notice')).toContainText('自動更新が止まっています', {
      timeout: 15_000,
    });

    // 途切れている間に、点が入る（この画面には届かない）
    await writeGameScoreDirectly(matchIds.live, 1, 9, 3);

    realtime.restore();
    await expect(page.getByTestId('live-down-notice')).toHaveCount(0, { timeout: 30_000 });
    await expect(row(page, 'live')).toContainText('9-3', { timeout: 10_000 });
    expect(refreshes.count).toBe(1);

    await context.close();
  });
});

// ---------------------------------------------------------------------
// 画面の幅
// ---------------------------------------------------------------------

// 手元に多いのは 390px（iPhone 12 以降）だが、375px（iPhone SE / 8）もまだ使われている
for (const width of [375, 390]) {
  test.describe(`${width}px 幅`, () => {
    test.use({ viewport: { width, height: 844 } });

    /** 全コートを開き、終わった試合も出す。いちばん縦横が詰まった状態にして測る。 */
    async function openEverything(page: Page) {
      await page.goto('/matches');
      await expect(courtHeading(page, LONG_COURT)).toBeVisible();
      const headings = page.getByRole('button', { name: /^コート/ });
      for (let index = 0; index < (await headings.count()); index += 1) {
        await headings.nth(index).click();
      }
      // 押すと文言が「隠す」に変わるので、「見る」が無くなるまで先頭を押していけば全部開く
      const doneToggles = page.getByRole('button', { name: /終了した\d+試合を見る/ });
      for (let remaining = await doneToggles.count(); remaining > 0; remaining -= 1) {
        await doneToggles.first().click();
      }
    }

    test('ページ全体が横にはみ出さない。長い名前・3 ゲームの点数・棄権の印でも崩れない', async ({
      page,
    }) => {
      // 長い名前の進行中の試合に出る人として入り、「あなたの試合」の印も付けて測る
      await enterAsPlayer(page, '愛知北', LONG_LIVE_A[0]);
      await openEverything(page);

      await expect(row(page, 'long-live')).toContainText('21-19 / 18-21 / 20-20');
      await expect(row(page, 'long-live')).toContainText('あなたの試合');
      await expect(row(page, 'retired')).toContainText('棄権');

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth).toBe(width);
      expect(scrollWidth).toBe(innerWidth);

      // 言葉が途中で切れたり、はみ出したりしていない（実測）
      const clipped = await page
        .locator('li[data-testid^="match-row-"] span')
        .evaluateAll((chunks) =>
          chunks
            .filter(
              (chunk) =>
                chunk.scrollWidth > chunk.clientWidth || chunk.scrollHeight > chunk.clientHeight
            )
            .map((chunk) => chunk.textContent)
        );
      expect(clipped).toEqual([]);

      // 行が横にカードからはみ出していない
      const overflowing = await page.locator('li[data-testid^="match-row-"]').evaluateAll((items) =>
        items
          .filter((item) => {
            const card = item.closest('div.rounded-\\[14px\\]');
            if (!card) return false;
            return item.getBoundingClientRect().right > card.getBoundingClientRect().right + 0.5;
          })
          .map((item) => item.textContent)
      );
      expect(overflowing).toEqual([]);
    });

    test('「自動更新が止まっています」の案内が出た状態でも、横にはみ出さない', async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const realtime = await controlRealtimeSocket(page);
      await enterAsViewer(page);
      await openMatchesAndWaitForLive(page);

      realtime.cut();
      const notice = page.getByTestId('live-down-notice');
      await expect(notice).toBeVisible({ timeout: 15_000 });

      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBe(innerWidth);
      const { scrollWidth: noticeScroll, clientWidth: noticeClient } = await notice.evaluate(
        (element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })
      );
      expect(noticeScroll).toBeLessThanOrEqual(noticeClient);

      await context.close();
    });
  });
}

test('押せるところ（絞り込み・コートの見出し・終了した試合の帯）はどれも44px以上', async ({
  page,
}) => {
  await enterAsPlayer(page, '愛知北', LIVE_A[0]);
  await page.goto('/matches');

  for (const name of ['全試合', '自分の試合']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const headingBox = (await courtHeading(page, LIVE_COURT).boundingBox())!;
  expect(headingBox.height).toBeGreaterThanOrEqual(44);

  await openCourt(page, LIVE_COURT);
  const toggleBox = (await page
    .getByRole('button', { name: /終了した\d+試合を見る/ })
    .boundingBox())!;
  expect(toggleBox.height).toBeGreaterThanOrEqual(44);
});
