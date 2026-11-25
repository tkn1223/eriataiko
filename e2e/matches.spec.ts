import { expect, test, type Browser, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import { takeScorer } from './helpers/scorer';
import {
  addLiveMatchLater,
  createMatchesScenario,
  deleteMatchesScenario,
  findMatchResult,
  findParticipantId,
  findSavedGameScore,
  setMatchScorerDirectly,
  writeGameScoreDirectly,
} from './helpers/courts-scenario';

/**
 * /matches（進行表）の画面確認。全コートのカード（1a）・コートの全試合（1b）・探す（1c）・
 * 試合の詳しい画面（1d・1e）・直す画面（2b）・訂正のあと（2c）。本物の試合を出し、
 * 試合速報で起きたこと（点・終了）をその場で映す。
 *
 * 試合は `createMatchesScenario` が作るテスト用のもの。seed の試合（コート 1）には頼らず、
 * `is_current` も触らない。テストごとに作り直し、最後に消す。
 * 2 台のブラウザ（Playwright の context を 2 つ）で、結果LIVE → 進行表への映りを確かめる。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 *       docs/specs/2026-11-22-matches-redesign.md
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

function courtCard(page: Page, courtNumber: number) {
  return page.getByTestId(`matches-court-card-${courtNumber}`);
}

/** コート札（1a の上の列・1b の上の列）。カードの押す部分と取り違えないよう、名前の末尾が状態のものだけ。 */
function courtChip(page: Page, courtNumber: number) {
  return page.getByRole('button', {
    name: new RegExp(`^コート${courtNumber} (試合中|呼出中|全試合終了)$`),
  });
}

function row(page: Page, key: string) {
  return page.getByTestId(`match-row-${matchIds[key]}`);
}

/** コートのカードを押して、そのコートの全試合（1b）を開く。 */
async function openCourt(page: Page, courtNumber: number) {
  await courtCard(page, courtNumber).getByRole('button').click();
  await expect(page).toHaveURL(new RegExp(`court=${courtNumber}$`));
  await expect(page.getByTestId('court-matches')).toBeVisible();
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
  else await enterAsPlayer(page, '愛知北', NEXT_A[0]);
  const refreshes = await openMatchesAndWaitForLive(page);
  await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  return { context, page, refreshes };
}

// ---------------------------------------------------------------------
// 1a 全コート（観戦者）
// ---------------------------------------------------------------------

test.describe('1a 全コート', () => {
  test.beforeEach(async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/matches');
  });

  test('開いた直後、何も押さずに全コートのいまの試合（両方の名前・点）と次の試合が見える', async ({
    page,
  }) => {
    const card = courtCard(page, LIVE_COURT);
    await expect(card).toContainText(LIVE_A.join('・'));
    await expect(card).toContainText(LIVE_B.join('・'));
    await expect(card.getByText('5', { exact: true })).toBeVisible();
    await expect(card.getByText('3', { exact: true })).toBeVisible();
    await expect(card).toContainText(`${NEXT_A.join('・')} vs ${NEXT_B.join('・')}`);
    // 呼出中のコートは「–」と次の試合
    await expect(courtCard(page, WAIT_9_COURT)).toContainText('呼出中');
    await expect(courtCard(page, WAIT_9_COURT)).toContainText(WAIT_9_A.join('・'));
  });

  test('帯の小見出しに「進行表 ・ 予選リーグ n/m 試合」が出て、ページ見出しの「進行表」は本文に無い', async ({
    page,
  }) => {
    await expect(page.locator('header')).toContainText(/進行表 ・ 予選リーグ \d+\/\d+ 試合/);
    await expect(page.getByRole('main').getByRole('heading', { name: '進行表' })).toHaveCount(0);
  });

  test('「全試合｜自分の試合」の切り替えは無い', async ({ page }) => {
    await expect(page.getByRole('button', { name: '自分の試合' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '全試合', exact: true })).toHaveCount(0);
  });

  test('コートのカードは試合のあるコートだけ番号順（9 の次が 10）。飛び番号は出ず、コート未定は最後', async ({
    page,
  }) => {
    const ids = await page
      .locator('[data-testid^="matches-court-card-"]')
      .evaluateAll((cards) => cards.map((card) => Number(card.id.replace('matches-court-', ''))));
    const mine = ids.filter((id) => id >= WAIT_9_COURT && id <= LONG_COURT);
    expect(mine).toEqual([9, 10, 11, 12, 14]);
    await expect(courtCard(page, SKIPPED_COURT)).toHaveCount(0);
    await expect(page.getByTestId('matches-undecided')).toContainText(`${UNDECIDED_A.join('・')}`);
  });

  test('コート札を押すと、そのコートのカードへ移る', async ({ page }) => {
    await courtChip(page, LONG_COURT).click();
    await expect(courtCard(page, LONG_COURT)).toBeInViewport({ ratio: 0.5 });
  });

  test('カードを押すとそのコートの全試合（1b）が出て、終わった試合も隠れていない', async ({
    page,
  }) => {
    await openCourt(page, LIVE_COURT);

    await expect(page.getByRole('heading', { name: '終わった試合 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '試合中', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'これから 1' })).toBeVisible();
    await expect(row(page, 'done')).toContainText(DONE_A.join('・'));
    await expect(row(page, 'live')).toContainText('試合中 ・ 第1ゲーム');
    await expect(row(page, 'next')).toContainText(NEXT_A.join('・'));
    // 札で隣のコートへ、「‹ 全コート」で戻れる
    await courtChip(page, FINISHED_COURT).click();
    await expect(row(page, 'retired')).toBeVisible();
    await page.getByRole('button', { name: /全コート/ }).click();
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  });

  test('戻るボタンで、コートの全試合から全コートの画面に戻る', async ({ page }) => {
    await openCourt(page, LIVE_COURT);

    await page.goBack();

    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  });

  test('棄権の試合は、棄権した側に札が付き、勝ちは相手になる', async ({ page }) => {
    await openCourt(page, FINISHED_COURT);

    const retired = row(page, 'retired');
    await expect(retired.getByTestId(`match-row-${matchIds.retired}-line-A`)).toContainText('棄権');
    await expect(retired.getByTestId(`match-row-${matchIds.retired}-line-B`)).not.toContainText(
      '棄権'
    );
    // 点では A が上でも、勝ったのは B（A の名前が薄くなる）
    await expect(retired.getByText(RETIRED_A.join('・'), { exact: true })).toHaveClass(/6b665f/);
  });

  test('観戦者には「▲あなた」も、あなたの試合の印も出ない', async ({ page }) => {
    await expect(page.getByText('▲あなた')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'あなた' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------
// 選手として入った人
// ---------------------------------------------------------------------

test.describe('選手として入った人', () => {
  test('自分の出番（これからの試合）があるコートの線に「▲あなた」が出て、ほかのコートには出ない', async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知北', NEXT_A[0]);
    await page.goto('/matches');

    await expect(courtCard(page, LIVE_COURT).getByText('▲あなた')).toBeVisible();
    await expect(courtCard(page, FINISHED_COURT).getByText('▲あなた')).toHaveCount(0);
  });

  test('自分が試合中のコートのカードには金の点が付く', async ({ page }) => {
    await enterAsPlayer(page, '愛知北', LIVE_A[0]);
    await page.goto('/matches');

    await expect(courtCard(page, LIVE_COURT).getByRole('img', { name: 'あなた' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------
// 1c 探す
// ---------------------------------------------------------------------

test.describe('1c 探す', () => {
  test.beforeEach(async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/matches');
  });

  test('名前の一部を入れると、その人の試合が出て、行の上にコートが出る。やめるで戻る', async ({
    page,
  }) => {
    await page.getByRole('searchbox').fill(NEXT_A[0]);

    await expect(row(page, 'next')).toBeVisible();
    await expect(row(page, 'next')).toContainText(`コート${LIVE_COURT}`);
    await expect(row(page, 'live')).toHaveCount(0);

    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  });

  test('試合中 → これから → 終わった試合の順に出る（チーム名でも探せる）', async ({ page }) => {
    // 3 つの試合に共通する名前は無いので、チーム名（愛知北）で探す
    await page.getByRole('searchbox').fill('愛知北');

    const headings = await page
      .getByTestId('search-results')
      .getByRole('heading')
      .allTextContents();
    const order = ['試合中', 'これから', '終わった試合'].map((title) =>
      headings.findIndex((heading) => heading.startsWith(title))
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('当てはまる試合が無ければ、日本語でそう出る', async ({ page }) => {
    await page.getByRole('searchbox').fill('ぜったいにいない名前');

    await expect(page.getByText('当てはまる試合は見つかりませんでした')).toBeVisible();
  });
});

// ---------------------------------------------------------------------
// 1d・1e 試合の詳しい画面
// ---------------------------------------------------------------------

test.describe('試合の詳しい画面', () => {
  test.beforeEach(async ({ page }) => {
    await enterAsViewer(page);
  });

  test('どの行を押しても、その試合の詳しい画面が開く（1b・1c）', async ({ page }) => {
    await page.goto(`/matches?court=${LIVE_COURT}`);
    await row(page, 'live').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/matches/${matchIds.live}$`));

    await page.goto('/matches');
    await page.getByRole('searchbox').fill(NEXT_A[0]);
    await row(page, 'next').getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/matches/${matchIds.next}$`));
  });

  test('試合中: 得点板と［コートNの試合速報を開く］が出て、押すと試合速報のそのコートへ移る', async ({
    page,
  }) => {
    await page.goto(`/matches/${matchIds.live}`);

    await expect(page.getByTestId('team-panel-A')).toContainText(LIVE_A[0]);
    await expect(page.getByTestId('team-panel-A')).toContainText('5');
    await expect(page.getByTestId('team-panel-B')).toContainText('3');
    // 下のメニューは「進行表」が現在地のまま
    await expect(
      page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: /進行表/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: /得点を訂正する/ })).toHaveCount(0);

    await page.getByRole('link', { name: `コート${LIVE_COURT}の試合速報を開く` }).click();

    await expect(page).toHaveURL(new RegExp(`/courts#court-${LIVE_COURT}$`));
    await expect(page.locator(`#court-${LIVE_COURT}`)).toBeInViewport();
  });

  test('終了: ゲームごとの点・勝・棄権・入力担当が出る。観戦者には［得点を訂正する］が出ない', async ({
    page,
  }) => {
    const scorerId = await findParticipantId('愛知北', NEXT_A[0]);
    await setMatchScorerDirectly(matchIds.retired, scorerId);
    markScenarioChanged();

    await page.goto(`/matches/${matchIds.retired}`);

    const table = page.getByTestId('result-table');
    await expect(table.getByTestId('result-row-A')).toContainText('21');
    await expect(table.getByTestId('result-row-B')).toContainText('勝');
    await expect(table.getByTestId('result-row-A')).toContainText('棄権');
    await expect(page.getByText(/入力担当：/)).toContainText(NEXT_A[0]);
    await expect(page.getByRole('link', { name: /得点を訂正する/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /星取表で見る/ })).toBeVisible();
  });

  test('一覧に無い試合の id を開くと、見つかりませんの画面になる', async ({ page }) => {
    const response = await page.goto('/matches/00000000-0000-4000-8000-000000000000');

    expect(response?.status()).toBe(404);
  });
});

// ---------------------------------------------------------------------
// 2b・2c 訂正
// ---------------------------------------------------------------------

test.describe('得点の訂正', () => {
  // 点を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  test('選手は終わった試合を直せる。保存すると詳しい画面に戻り「訂正しました」が出て、試合は終了のまま、コートの今の試合は進行中のまま', async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知北', NEXT_A[0]);
    await page.goto(`/matches/${matchIds.done}`);
    await page.getByRole('link', { name: /得点を訂正する/ }).click();
    await expect(page).toHaveURL(new RegExp(`/matches/${matchIds.done}/correct$`));

    await page
      .getByRole('button', { name: `${DONE_A.join('・')}の第1ゲームの得点を1増やす` })
      .click();
    await expect(page.getByTestId('team-panel-A')).toContainText('元は 21');
    await expect(page.getByTestId('change-summary')).toContainText('第1ゲーム 21-15 → 22-15');
    await page.getByRole('button', { name: 'この内容で訂正する' }).click();

    await expect(page).toHaveURL(new RegExp(`/matches/${matchIds.done}\\?corrected=1$`));
    await expect(page.getByRole('status')).toContainText('訂正しました');
    await expect(page.getByTestId('result-row-A')).toContainText('22');

    expect(await findSavedGameScore(matchIds.done, 1)).toEqual({ sideAScore: 22, sideBScore: 15 });
    expect((await findMatchResult(matchIds.done))?.status).toBe('done');
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');
  });

  test('点の数字を押すと数字で直接入れられる。棄権を付けると勝ちが相手に変わる', async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知北', NEXT_A[0]);
    await page.goto(`/matches/${matchIds.done}/correct`);

    await page
      .getByRole('button', { name: `${DONE_A.join('・')}の第1ゲームの点を入力する` })
      .click();
    await page.getByRole('textbox', { name: `${DONE_A.join('・')}の第1ゲームの点` }).fill('10');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByTestId('team-panel-A')).toContainText('元は 21');
    await page.getByRole('radio', { name: `${DONE_A.join('・')} が棄権` }).click();
    await page.getByRole('button', { name: 'この内容で訂正する' }).click();

    await expect(page.getByRole('status')).toContainText('訂正しました');
    expect((await findMatchResult(matchIds.done))?.ending).toBe('retired_side_a');
  });

  test('同点になる直し方は、日本語の理由が出て保存できない', async ({ page }) => {
    await enterAsPlayer(page, '愛知北', NEXT_A[0]);
    await page.goto(`/matches/${matchIds.done}/correct`);

    await page
      .getByRole('button', { name: `${DONE_A.join('・')}の第1ゲームの点を入力する` })
      .click();
    await page.getByRole('textbox').fill('15');
    await page.getByRole('textbox').press('Enter');

    // Next.js の画面切り替えの読み上げ欄も role="alert" なので、文言で絞る
    await expect(
      page.getByRole('alert').filter({ hasText: '同点では訂正できません' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'この内容で訂正する' })).toBeDisabled();
    expect(await findSavedGameScore(matchIds.done, 1)).toEqual({ sideAScore: 21, sideBScore: 15 });
  });

  test('観戦者は直す画面を開いても案内が出るだけで、入口を直接呼んでも 401', async ({
    page,
    request,
  }) => {
    await enterAsViewer(page);
    await page.goto(`/matches/${matchIds.done}/correct`);
    await expect(page.getByText('訂正できるのは、選手として入場した人だけです')).toBeVisible();

    const anonymous = await request.put(`/api/matches/${matchIds.done}/correction`, {
      data: { scores: [{ gameNumber: 1, sideAScore: 22, sideBScore: 15 }], retiredSide: null },
    });
    expect(anonymous.status()).toBe(401);
  });

  test('終わっていない試合の直す画面は、詳しい画面に戻される', async ({ page }) => {
    await enterAsPlayer(page, '愛知北', NEXT_A[0]);

    await page.goto(`/matches/${matchIds.live}/correct`);

    await expect(page).toHaveURL(new RegExp(`/matches/${matchIds.live}$`));
  });
});

// ---------------------------------------------------------------------
// 2 台のブラウザ: 試合速報の操作が、開き直さなくても進行表に映る
// ---------------------------------------------------------------------

test.describe('試合速報 の操作が、別のブラウザの進行表にその場で映る', () => {
  // 点・終了・試合を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  function liveCard(page: Page, courtNumber: number) {
    return page.getByTestId(`court-card-${courtNumber}`);
  }

  /** 試合速報を開く側。seed の選手として入り、購読がつながるまで待つ。 */
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
    await expect(liveCard(page, LIVE_COURT)).toBeVisible();
    // ＋ − と「試合終了」は担当にだけ出る。先に「入力を担当する」を 1 度押す
    await takeScorer(liveCard(page, LIVE_COURT));
    return { context, page };
  }

  function plusButton(page: Page, names: string[]) {
    return liveCard(page, LIVE_COURT).getByRole('button', {
      name: `${names.join('・')}の第1ゲームの得点を1増やす`,
    });
  }

  test('試合速報 で ＋ を押すと、別のブラウザで開いている進行表（カード・詳しい画面）に数秒で同じ点数が出る（開き直さない）', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await expect(courtCard(watcher.page, LIVE_COURT).getByText('5', { exact: true })).toBeVisible();
    const detail = await watcher.context.newPage();
    await detail.goto(`/matches/${matchIds.live}`);
    await expect(detail.getByTestId('team-panel-A')).toContainText('5');
    const operator = await openCourtsAsPlayer(browser);

    await plusButton(operator.page, LIVE_A).click();

    await expect(courtCard(watcher.page, LIVE_COURT).getByText('6', { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(detail.getByTestId('team-panel-A')).toContainText('6', { timeout: 5000 });
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('試合速報で試合終了すると、進行表のそのコートの進み具合・状態が変わり、終わった試合に入る', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await openCourt(watcher.page, LIVE_COURT);
    await expect(watcher.page.getByTestId('court-matches')).toContainText('1/3 ・ 残り2');
    const operator = await openCourtsAsPlayer(browser);

    await liveCard(operator.page, LIVE_COURT).getByRole('button', { name: '試合終了' }).click();
    await operator.page.getByRole('button', { name: 'OK' }).click();

    await expect(watcher.page.getByTestId('court-matches')).toContainText('2/3 ・ 残り1', {
      timeout: 5000,
    });
    await expect(watcher.page.getByTestId('court-status')).toContainText('呼出中');
    // 勝った側（A 側）はそのまま、負けた側（B 側）の名前が薄くなる
    await expect(
      row(watcher.page, 'live').getByText(LIVE_B.join('・'), { exact: true })
    ).toHaveClass(/6b665f/);
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('点が変わるたびに進行表全体を読み直していない（つながったときの 1 回のあと、10 回押しても 0 回）', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    const operator = await openCourtsAsPlayer(browser);

    for (let press = 0; press < 10; press += 1) {
      await plusButton(operator.page, LIVE_A).click();
    }

    await expect(courtCard(watcher.page, LIVE_COURT).getByText('15', { exact: true })).toBeVisible({
      timeout: 8000,
    });
    // 先に書いた変化が届き終わったことを、あとから別のコートに書いた点が映ることで確かめる
    // カードに大きく出るのはいまのゲーム（long-live は第3ゲームの途中）なので、第3ゲームを書く
    await writeGameScoreDirectly(matchIds['long-live'], 3, 30, 20);
    await expect(courtCard(watcher.page, LONG_COURT).getByText('30', { exact: true })).toBeVisible({
      timeout: 5000,
    });
    // 読み直しは頼まれてから最長で最小の間隔（3 秒）待って走る。「起きない」ことは、待つ以外に確かめようがない
    await watcher.page.waitForTimeout(3500);
    expect(watcher.refreshes.count).toBe(0);

    await operator.context.close();
    await watcher.context.close();
  });

  test('手元に無い試合の変化が続けて届いても、読み直しは 1 回。読み直すと新しい試合が出る', async ({
    browser,
  }) => {
    const watcher = await openMatchesAs(browser, 'viewer');
    await expect(courtCard(watcher.page, WAIT_9_COURT)).toContainText('0/1');

    // 画面を開いたあとにできた試合が始まった（手元に無い）。続けて点も入る
    const lateMatchId = await addLiveMatchLater(matchIds.wait9, WAIT_9_COURT, 2);
    await writeGameScoreDirectly(lateMatchId, 1, 1, 0);
    await writeGameScoreDirectly(lateMatchId, 1, 2, 0);

    await expect(courtCard(watcher.page, WAIT_9_COURT)).toContainText('0/2', { timeout: 8000 });
    await expect(courtCard(watcher.page, WAIT_9_COURT)).toContainText('試合中');
    // 2 回目が走らないことは、読み直しの最小の間隔（3 秒）を過ぎるまで見る
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

test.describe('試合速報 と進行表を行き来する', () => {
  // 点・終了・試合を書き換えるので、次のテストでは作り直す
  test.beforeEach(markScenarioChanged);

  test('行き来を繰り返しても、つながっている購読は常に 1 本。戻った進行表にも点がその場で映る', async ({
    page,
  }) => {
    const channels = trackLiveChannels(page);
    await enterAsViewer(page);
    await page.goto('/matches');
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
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
      await moveTo('試合速報', () =>
        expect(page.getByTestId(`court-card-${LIVE_COURT}`)).toBeVisible()
      );
      await moveTo('進行表', () => expect(courtCard(page, LIVE_COURT)).toBeVisible());
    }

    await expect(page.getByTestId('live-down-notice')).toHaveCount(0);
    await writeGameScoreDirectly(matchIds.live, 1, 7, 3);
    await expect(courtCard(page, LIVE_COURT).getByText('7', { exact: true })).toBeVisible({
      timeout: 5000,
    });
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
    await expect(courtCard(page, LIVE_COURT).getByText('5', { exact: true })).toBeVisible();

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

    async function expectNoHorizontalOverflow(page: Page) {
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth).toBe(width);
      expect(scrollWidth).toBe(innerWidth);
    }

    test('全コート（1a）・コートの全試合（1b）・探す（1c）が横にはみ出さない。長い名前・3 ゲームの点・棄権でも崩れない', async ({
      page,
    }) => {
      // 長い名前の進行中の試合に出る人として入り、金の点も付けて測る
      await enterAsPlayer(page, '愛知北', LONG_LIVE_A[0]);
      await page.goto('/matches');
      await expect(courtCard(page, LONG_COURT)).toBeVisible();
      await expectNoHorizontalOverflow(page);

      for (const court of [LIVE_COURT, FINISHED_COURT, LONG_COURT]) {
        await page.goto(`/matches?court=${court}`);
        await expect(page.getByTestId('court-matches')).toBeVisible();
        await expectNoHorizontalOverflow(page);
        // 行がカードの外へはみ出していない
        const overflowing = await page
          .locator('li[data-testid^="match-row-"]')
          .evaluateAll((items) =>
            items
              .filter(
                (item) =>
                  item.scrollWidth > item.clientWidth + 0.5 ||
                  item.getBoundingClientRect().right > window.innerWidth
              )
              .map((item) => item.textContent)
          );
        expect(overflowing).toEqual([]);
      }

      await page.goto('/matches');
      await page.getByRole('searchbox').fill('愛知');
      await expectNoHorizontalOverflow(page);
    });

    test('詳しい画面（試合中・終了・棄権）と直す画面が横にはみ出さない', async ({ page }) => {
      await enterAsPlayer(page, '愛知北', LONG_LIVE_A[0]);
      for (const path of [
        `/matches/${matchIds['long-live']}`,
        `/matches/${matchIds['long-done']}`,
        `/matches/${matchIds.retired}`,
        `/matches/${matchIds['long-done']}/correct`,
      ]) {
        await page.goto(path);
        await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
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

      await expectNoHorizontalOverflow(page);
      const { scrollWidth: noticeScroll, clientWidth: noticeClient } = await notice.evaluate(
        (element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })
      );
      expect(noticeScroll).toBeLessThanOrEqual(noticeClient);

      await context.close();
    });
  });
}

test('押せるところ（コート札・カード・探す欄・行・訂正の画面のボタン）はどれも44px以上', async ({
  page,
}) => {
  await enterAsPlayer(page, '愛知北', NEXT_A[0]);
  await page.goto('/matches');
  await expect(courtCard(page, LIVE_COURT)).toBeVisible();

  const targets = [
    courtChip(page, LIVE_COURT),
    courtCard(page, LIVE_COURT).getByRole('button'),
    page.getByRole('searchbox'),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }

  await page.goto(`/matches?court=${LIVE_COURT}`);
  const rowBox = (await row(page, 'next').getByRole('link').boundingBox())!;
  expect(rowBox.height).toBeGreaterThanOrEqual(44);

  await page.goto(`/matches/${matchIds.done}/correct`);
  for (const name of ['この内容で訂正する']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (const radio of await page.getByRole('radio').all()) {
    expect((await radio.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const tab of await page.getByRole('tab').all()) {
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
