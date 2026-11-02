import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import { takeScorer } from './helpers/scorer';
import {
  clearMatchScorerDirectly,
  createMatchesScenario,
  deleteMatchesScenario,
  findMatchResult,
  findMatchScorer,
  findParticipantId,
  findSavedGameScore,
  findScorerLogActions,
  setMatchScorerDirectly,
  shiftMatchScorerTime,
} from './helpers/courts-scenario';
import { loadTestEnv } from '../tests/load-env.mjs';

/**
 * 得点入力の担当（docs/specs/2026-10-14-match-scorer.md）の画面確認。
 * 2 つのブラウザに**別の選手**で入り、取る・ほかの人に名前が映る・引き継ぐ・断られる・5 分・終了は担当だけ・
 * 直すで担当になる・観戦者を確かめる。
 *
 * 選手は seed.sql の「愛知南のたろう」と「愛知北のたろう」。同じニックネームでも、チーム名つきで
 * 見分けられることも見る。試合はテスト用のもの（`createMatchesScenario`）で、seed の試合や
 * `is_current` には触らない。テストごとに作り直し、最後に消す。
 */

const LIVE_COURT = 11;
const OTHER_COURT = 12;
const DONE_COURT = 13;

const LIVE_A = ['青山', '赤坂'];
const LIVE_B = ['緑川', '紫野'];

const MINAMI = { team: '愛知南', name: 'たろう' } as const;
const KITA = { team: '愛知北', name: 'たろう' } as const;
const MINAMI_LABEL = '愛知南のたろう';
const KITA_LABEL = '愛知北のたろう';

let matchIds: Record<string, string>;

test.beforeEach(async () => {
  matchIds = await createMatchesScenario([
    {
      key: 'live',
      courtNumber: LIVE_COURT,
      orderInCourt: 1,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 21回戦',
      scores: [[5, 3]],
      teamA: [LIVE_A[0], LIVE_A[1]],
      teamB: [LIVE_B[0], LIVE_B[1]],
    },
    {
      key: 'other',
      courtNumber: OTHER_COURT,
      orderInCourt: 1,
      status: 'live',
      maxGameCount: 1,
      roundName: '予選 22回戦',
      scores: [[7, 7]],
      teamA: ['白石', '黒田'],
      teamB: ['茶谷', '灰原'],
    },
    {
      key: 'done',
      courtNumber: DONE_COURT,
      orderInCourt: 1,
      status: 'done',
      finishedMinutesAgo: 5,
      maxGameCount: 1,
      roundName: '予選 23回戦',
      scores: [[21, 12]],
      teamA: ['杉本', '柳田'],
      teamB: ['桃井', '栗原'],
    },
  ]);
});

test.afterAll(deleteMatchesScenario);

function courtCard(page: Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

function plusButton(card: Locator, names: string[]) {
  return card.getByRole('button', { name: `${names.join('・')}の第1ゲームの得点を1増やす` });
}

/** 画面全体の読み直し（router.refresh）か。読み直すと `/courts?_rsc=...` が飛ぶ。 */
function isCourtsRefresh(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname === '/courts' && parsed.searchParams.has('_rsc');
}

/**
 * 結果LIVE を、seed の選手として開き、購読がつながるまで待つ。
 * 購読は、つながる前の変化を届けないので、画面はつながったときに 1 回だけ読み直す。その返事を合図にする。
 */
async function openCourtsAs(
  browser: Browser,
  who: { team: string; name: string } | 'viewer',
  options: { viewport?: { width: number; height: number }; offline?: boolean } = {}
) {
  const context = await browser.newContext(options.viewport ? { viewport: options.viewport } : {});
  const page = await context.newPage();
  if (who === 'viewer') await enterAsViewer(page);
  else await enterAsPlayer(page, who.team, who.name);

  const refreshes = { count: 0 };
  if (options.offline) {
    // 購読をつなげない（電波が細くて、他の人の変化が届かない画面）。担当が移ったことを知らないままにする
    await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
    await page.goto('/courts');
  } else {
    const caughtUp = page.waitForResponse((response) => isCourtsRefresh(response.url()));
    await page.goto('/courts');
    await caughtUp;
  }
  page.on('request', (request) => {
    if (isCourtsRefresh(request.url())) refreshes.count += 1;
  });
  await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  return { context, page, refreshes };
}

test.describe('取る', () => {
  test('担当がいない進行中の試合に「入力する人がいません」と「得点を入力する」が出る。押すと自分が担当になり、＋ − と「試合を終了する」が出る', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);

    await expect(card.getByText('⚠ 入力する人がいません')).toBeVisible();
    await expect(plusButton(card, LIVE_A)).toHaveCount(0);
    await expect(card.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);

    await card.getByRole('button', { name: '得点を入力する' }).click();

    await expect(plusButton(card, LIVE_A)).toBeVisible();
    await expect(card.getByRole('button', { name: '試合を終了する' })).toBeVisible();
    await expect(card.getByRole('button', { name: '入力をやめる' })).toBeVisible();
    await expect(card.getByText(/入力する人がいません/)).toHaveCount(0);

    // データベースの担当が自分になり、記録が残る
    const participantId = await findParticipantId(MINAMI.team, MINAMI.name);
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(participantId);
    expect((await findMatchScorer(matchIds.live)).claimedAt).not.toBeNull();
    await expect.poll(() => findScorerLogActions(matchIds.live)).toEqual(['scorer.claim']);

    // 担当は試合に付く。ほかのコートの試合は担当がいないまま
    await expect(
      courtCard(mine.page, OTHER_COURT).getByText('⚠ 入力する人がいません')
    ).toBeVisible();

    await mine.context.close();
  });

  test('ほかの人の画面には「愛知南のたろうさんが入力しています」（チーム名つき）と「引き継ぐ」がその場で出る（読み直さない）', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const other = await openCourtsAs(browser, KITA);
    const cardOnOther = courtCard(other.page, LIVE_COURT);
    await expect(cardOnOther.getByText('⚠ 入力する人がいません')).toBeVisible();

    await takeScorer(courtCard(mine.page, LIVE_COURT));

    await expect(cardOnOther.getByText(`${MINAMI_LABEL}さんが入力しています`)).toBeVisible({
      timeout: 5000,
    });
    await expect(cardOnOther.getByRole('button', { name: '引き継ぐ' })).toBeVisible();
    await expect(plusButton(cardOnOther, LIVE_A)).toHaveCount(0);
    await expect(cardOnOther.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);
    expect(other.refreshes.count).toBe(0);

    await mine.context.close();
    await other.context.close();
  });

  test('呼出待ちのコートも、先に「得点を入力する」を押す。最初の 1 点で LIVE になる', async ({
    browser,
  }) => {
    await createMatchesScenario([
      {
        key: 'waiting',
        courtNumber: LIVE_COURT,
        orderInCourt: 1,
        status: 'waiting',
        maxGameCount: 1,
        roundName: '予選 24回戦',
        scores: [],
        teamA: [LIVE_A[0], LIVE_A[1]],
        teamB: [LIVE_B[0], LIVE_B[1]],
      },
    ]).then((created) => {
      matchIds = created;
    });
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await expect(card.getByText('呼出待ち')).toBeVisible();
    await expect(plusButton(card, LIVE_A)).toHaveCount(0);

    await card.getByRole('button', { name: '得点を入力する' }).click();
    await plusButton(card, LIVE_A).click();

    await expect(card.getByText('LIVE')).toBeVisible();
    await expect.poll(async () => (await findMatchResult(matchIds.waiting))?.status).toBe('live');
    await expect
      .poll(() => findSavedGameScore(matchIds.waiting, 1))
      .toEqual({ sideAScore: 1, sideBScore: 0 });
    // 取る操作は 1 度だけ（1 試合に 1 回押せば足りる）
    expect(await findScorerLogActions(matchIds.waiting)).toEqual(['scorer.claim']);

    await mine.context.close();
  });

  test('取る操作が電波で失敗しても ＋ は押せて、点は保存される。つながれば担当も取れる（⑤）', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await mine.page.route('**/api/matches/*/scorer', (route) => route.abort());

    await card.getByRole('button', { name: '得点を入力する' }).click();
    await expect(card.getByRole('status')).toContainText('入力の担当を取れていません');
    await plusButton(card, LIVE_A).click();

    // 点は、担当を取る操作が失敗していても保存される（入口が、担当のいない試合の点を受けて担当にする）
    await expect
      .poll(() => findSavedGameScore(matchIds.live, 1))
      .toEqual({ sideAScore: 6, sideBScore: 3 });
    const participantId = await findParticipantId(MINAMI.team, MINAMI.name);
    expect((await findMatchScorer(matchIds.live)).participantId).toBe(participantId);

    // 電波が戻ると、取る操作の送り直しも受け付けられて、案内が消える
    await mine.page.unroute('**/api/matches/*/scorer');
    await expect(card.getByRole('status')).toHaveCount(0, { timeout: 20_000 });

    await mine.context.close();
  });
});

test.describe('引き継ぐ', () => {
  test('「引き継ぐ」→ 確認「◯◯さんが入れています。引き継ぎますか？」→ OK で担当が移る。戻るなら移らない', async ({
    browser,
  }) => {
    await setMatchScorerDirectly(matchIds.live, await findParticipantId(KITA.team, KITA.name), 1);
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await expect(card.getByText(`${KITA_LABEL}さんが入力しています`)).toBeVisible();

    await card.getByRole('button', { name: '引き継ぐ' }).click();
    await expect(
      mine.page.getByText(`${KITA_LABEL}さんが入れています。引き継ぎますか？`)
    ).toBeVisible();
    await mine.page.getByRole('button', { name: '戻る' }).click();
    await expect(mine.page.getByRole('dialog')).toHaveCount(0);
    expect((await findMatchScorer(matchIds.live)).participantId).toBe(
      await findParticipantId(KITA.team, KITA.name)
    );

    await card.getByRole('button', { name: '引き継ぐ' }).click();
    await mine.page.getByRole('button', { name: 'OK' }).click();

    await expect(plusButton(card, LIVE_A)).toBeVisible();
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(await findParticipantId(MINAMI.team, MINAMI.name));
    await expect.poll(() => findScorerLogActions(matchIds.live)).toEqual(['scorer.takeover']);

    await mine.context.close();
  });

  test('引き継ぐと担当が移り、前の担当の ＋ は断られて「◯◯さんが担当しています」と送れなかった点が出る。点は上書きされない。前の人も引き継ぎ直せる', async ({
    browser,
  }) => {
    // 前の担当の画面は、引き継がれたことをまだ知らない（購読がつながっていない）
    const previous = await openCourtsAs(browser, MINAMI, { offline: true });
    const previousCard = courtCard(previous.page, LIVE_COURT);
    await takeScorer(previousCard);

    const next = await openCourtsAs(browser, KITA);
    await takeScorer(courtCard(next.page, LIVE_COURT));
    const kitaId = await findParticipantId(KITA.team, KITA.name);
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(kitaId);

    // 前の担当が、知らずに ＋ を押す
    await plusButton(previousCard, LIVE_A).click();

    const notice = previousCard.getByRole('alert');
    await expect(notice).toContainText(`${KITA_LABEL}さんが担当しています`);
    await expect(notice).toContainText('送れなかった点：第1ゲーム 6-3');
    // 保存されない（引き継いだ人の点が残る）
    expect(await findSavedGameScore(matchIds.live, 1)).toEqual({ sideAScore: 5, sideBScore: 3 });

    // 読み直しで、画面もいまの担当の表示に変わる。知らせは「閉じる」まで残り、閉じると消える
    await expect(previousCard.getByText(`${KITA_LABEL}さんが入力しています`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(plusButton(previousCard, LIVE_A)).toHaveCount(0);
    await expect(notice).toBeVisible();
    await previousCard.getByRole('button', { name: '閉じる' }).click();
    await expect(previousCard.getByRole('alert')).toHaveCount(0);

    // ほかのコートは触れる
    await takeScorer(courtCard(previous.page, OTHER_COURT));

    // 前の人も引き継ぎ直せる
    await previousCard.getByRole('button', { name: '引き継ぐ' }).click();
    await previous.page.getByRole('button', { name: 'OK' }).click();
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(await findParticipantId(MINAMI.team, MINAMI.name));

    await previous.context.close();
    await next.context.close();
  });

  test('引き継いだ人が押した点は保存され、前の人の画面にその場で映る', async ({ browser }) => {
    const previous = await openCourtsAs(browser, MINAMI);
    await takeScorer(courtCard(previous.page, LIVE_COURT));
    const next = await openCourtsAs(browser, KITA);
    await takeScorer(courtCard(next.page, LIVE_COURT));

    await plusButton(courtCard(next.page, LIVE_COURT), LIVE_B).click();

    await expect
      .poll(() => findSavedGameScore(matchIds.live, 1))
      .toEqual({ sideAScore: 5, sideBScore: 4 });
    await expect(courtCard(previous.page, LIVE_COURT).getByText('4', { exact: true })).toBeVisible({
      timeout: 5000,
    });
    // 前の人の画面は、いまの担当の名前を出し、＋ は出ない
    await expect(
      courtCard(previous.page, LIVE_COURT).getByText(`${KITA_LABEL}さんが入力しています`)
    ).toBeVisible();

    await previous.context.close();
    await next.context.close();
  });
});

test.describe('5 分たった担当', () => {
  test('最後に点を入れてから 5 分たつと、ほかの人の画面が「入力する人がいません」に変わり、確認なしで取れる', async ({
    browser,
  }) => {
    const kitaId = await findParticipantId(KITA.team, KITA.name);
    await setMatchScorerDirectly(matchIds.live, kitaId, 1);
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await expect(card.getByText(`${KITA_LABEL}さんが入力しています`)).toBeVisible();
    await expect(card.getByRole('button', { name: '引き継ぐ' })).toBeVisible();

    // データベースの時刻をずらして「5 分たった」を作る（4 分前では、まだ変わらない）
    await shiftMatchScorerTime(matchIds.live, 4);
    await expect(card.getByText(`${KITA_LABEL}さんが入力しています`)).toBeVisible();
    await shiftMatchScorerTime(matchIds.live, 6);
    await expect(card.getByText('⚠ 入力する人がいません')).toBeVisible({ timeout: 5000 });

    await card.getByRole('button', { name: '得点を入力する' }).click();

    // 確認の画面は出ない。そのまま担当になる
    await expect(mine.page.getByRole('dialog')).toHaveCount(0);
    await expect(plusButton(card, LIVE_A)).toBeVisible();
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(await findParticipantId(MINAMI.team, MINAMI.name));
    await expect.poll(() => findScorerLogActions(matchIds.live)).toEqual(['scorer.claim']);

    await mine.context.close();
  });

  test('5 分たった担当の人が押した点は、まだほかの人が取っていなければ保存される（自分のまま）', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await takeScorer(card);
    // 画面は取る操作の返事を待たずに担当として見せるので、DB に書かれてから時刻をずらす
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .not.toBeNull();
    await shiftMatchScorerTime(matchIds.live, 30);

    await plusButton(card, LIVE_A).click();

    await expect
      .poll(() => findSavedGameScore(matchIds.live, 1))
      .toEqual({ sideAScore: 6, sideBScore: 3 });
    // 点を入れたので、最後に点を入れた時刻（点の保存時刻）が新しくなっている。担当になった時刻はそのまま
    const { claimedAt, lastScoredAt } = await findMatchScorer(matchIds.live);
    expect(Date.now() - new Date(lastScoredAt!).getTime()).toBeLessThan(60_000);
    expect(Date.now() - new Date(claimedAt!).getTime()).toBeGreaterThan(29 * 60_000);

    await mine.context.close();
  });
});

test.describe('入力をやめる', () => {
  test('「入力をやめる」で担当が外れ、ほかの人の画面に「入力する人がいません」が出る', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const other = await openCourtsAs(browser, KITA);
    await takeScorer(courtCard(mine.page, LIVE_COURT));
    await expect(
      courtCard(other.page, LIVE_COURT).getByText(`${MINAMI_LABEL}さんが入力しています`)
    ).toBeVisible({ timeout: 5000 });

    await courtCard(mine.page, LIVE_COURT).getByRole('button', { name: '入力をやめる' }).click();

    await expect(
      courtCard(mine.page, LIVE_COURT).getByText('⚠ 入力する人がいません')
    ).toBeVisible();
    await expect(courtCard(other.page, LIVE_COURT).getByText('⚠ 入力する人がいません')).toBeVisible(
      {
        timeout: 5000,
      }
    );
    expect((await findMatchScorer(matchIds.live)).participantId).toBeNull();
    await expect
      .poll(() => findScorerLogActions(matchIds.live))
      .toEqual(['scorer.claim', 'scorer.release']);

    await mine.context.close();
    await other.context.close();
  });
});

test.describe('試合の終了は担当だけ', () => {
  test('担当でない人には「試合を終了する」が出ない。入口を直接叩いても断られ、試合は終わらない', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    await takeScorer(courtCard(mine.page, LIVE_COURT));
    const other = await openCourtsAs(browser, KITA);
    const cardOnOther = courtCard(other.page, LIVE_COURT);
    await expect(cardOnOther.getByText(`${MINAMI_LABEL}さんが入力しています`)).toBeVisible();
    await expect(cardOnOther.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);

    const response = await other.page.request.post(`/api/matches/${matchIds.live}/result`);

    expect(response.status()).toBe(409);
    expect((await response.json()).error).toContain(`${MINAMI_LABEL}さんが担当しています`);
    expect((await findMatchResult(matchIds.live))?.status).toBe('live');

    // 担当の人は終了できる
    await courtCard(mine.page, LIVE_COURT).getByRole('button', { name: '試合を終了する' }).click();
    await mine.page.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await findMatchResult(matchIds.live))?.status).toBe('done');

    await mine.context.close();
    await other.context.close();
  });
});

test.describe('直す', () => {
  test('1 つ前の「直す」は誰でも押せて、押した人がその試合の担当になる。ほかの人の画面には名前が映る', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const watcher = await openCourtsAs(browser, KITA);
    await expect(mine.page.getByTestId(`previous-match-${DONE_COURT}`)).toBeVisible();

    await mine.page
      .getByTestId(`previous-match-${DONE_COURT}`)
      .getByRole('button', { name: '直す' })
      .click();
    await mine.page.getByRole('button', { name: 'OK' }).click();

    const fixing = mine.page.getByTestId(`fixing-match-${DONE_COURT}`);
    await expect(fixing.getByText('直し中')).toBeVisible();
    // 押した人は、そのまま直せる（「得点を入力する」を押さなくてよい）
    await expect(
      fixing.getByRole('button', { name: '杉本・柳田の第1ゲームの得点を1増やす' })
    ).toBeVisible();
    await expect(fixing.getByRole('button', { name: 'もう一度終了する' })).toBeVisible();
    await expect
      .poll(async () => (await findMatchScorer(matchIds.done)).participantId)
      .toBe(await findParticipantId(MINAMI.team, MINAMI.name));

    // ほかの人の画面には、直している人の名前が出る
    const fixingOnWatcher = watcher.page.getByTestId(`fixing-match-${DONE_COURT}`);
    await expect(fixingOnWatcher.getByText(`${MINAMI_LABEL}さんが入力しています`)).toBeVisible({
      timeout: 5000,
    });
    await expect(fixingOnWatcher.getByRole('button', { name: 'もう一度終了する' })).toHaveCount(0);

    await mine.context.close();
    await watcher.context.close();
  });
});

test.describe('送れていない点があるまま、別の人として入り直したとき（⑪）', () => {
  /**
   * 結果LIVE を開いたまま、マイページ →「別の人として入り直す」→ 入場画面で退場して別の人で入る →
   * 「大会の画面へ」で戻る（画面を読み込み直さないので、送れていない点はこの端末に残っている）。
   */
  async function reenterThroughEntryScreen(page: Page, who: { team: string; name: string }) {
    await page.getByRole('link', { name: /myページ/ }).click();
    await page.getByRole('link', { name: '別の人として入り直す' }).click();
    await page.getByRole('button', { name: '退場する' }).click();
    await page.getByRole('button', { name: new RegExp(who.team) }).click();
    await page.getByRole('button', { name: new RegExp(who.name) }).click();
    await page.getByPlaceholder('当日配布された合言葉').fill(loadTestEnv().TOURNAMENT_PASSCODE);
    await page.getByRole('button', { name: '入場する' }).click();
    await page.getByRole('link', { name: '大会の画面へ' }).click();
    await expect(courtCard(page, LIVE_COURT)).toBeVisible();
  }

  test('担当が空いていても、前の人が押した点は入り直した人の名前で送らない。カードに知らせと送れなかった点が出る', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await takeScorer(card);
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .not.toBeNull();

    // 電波が無く、押した点が送れない。そのあいだに担当が空く（入口は空いていれば送った人を担当にする）
    await mine.page.route('**/api/matches/*/scores', (route) => route.abort());
    await plusButton(card, LIVE_A).click();
    await expect(card.getByRole('status')).toContainText('保存できていません');
    await clearMatchScorerDirectly(matchIds.live);

    await reenterThroughEntryScreen(mine.page, KITA);
    await mine.page.unroute('**/api/matches/*/scores');

    const backCard = courtCard(mine.page, LIVE_COURT);
    await expect(backCard.getByRole('alert')).toContainText('別の人として入り直したため');
    await expect(backCard.getByRole('alert')).toContainText('送れなかった点：第1ゲーム 6-3');
    // 送り直しの間隔（最大 10 秒）を越えて待っても、北のたろうの名前で保存されず、担当にもならない
    await mine.page.waitForTimeout(11_000);
    expect(await findSavedGameScore(matchIds.live, 1)).toEqual({ sideAScore: 5, sideBScore: 3 });
    expect((await findMatchScorer(matchIds.live)).participantId).toBeNull();

    await mine.context.close();
  });

  test('入場の画面を通らずに入り直した（別のタブなど）ときも、入り直した人が担当でなければ入口が断り、「◯◯さんが担当しています」と送れなかった点が出る', async ({
    browser,
  }) => {
    const mine = await openCourtsAs(browser, MINAMI);
    const card = courtCard(mine.page, LIVE_COURT);
    await takeScorer(card);
    await expect
      .poll(async () => (await findMatchScorer(matchIds.live)).participantId)
      .toBe(await findParticipantId(MINAMI.team, MINAMI.name));

    // 電波が無く、押した点が送れない
    await mine.page.route('**/api/matches/*/scores', (route) => route.abort());
    await plusButton(card, LIVE_A).click();
    await expect(card.getByRole('status')).toContainText('保存できていません');

    // 同じ端末の入場（Cookie）だけを別の人に替える。この画面の預かり場所は入り直したことを知らないので、
    // 送り直した点は入口の担当の確かめで断られる
    await enterAsPlayer(mine.page, KITA.team, KITA.name);
    await mine.page.unroute('**/api/matches/*/scores');

    await expect(card.getByRole('alert')).toContainText(`${MINAMI_LABEL}さんが担当しています`, {
      timeout: 20_000,
    });
    await expect(card.getByRole('alert')).toContainText('送れなかった点：第1ゲーム 6-3');
    expect(await findSavedGameScore(matchIds.live, 1)).toEqual({ sideAScore: 5, sideBScore: 3 });
    expect((await findMatchScorer(matchIds.live)).participantId).toBe(
      await findParticipantId(MINAMI.team, MINAMI.name)
    );

    await mine.context.close();
  });
});

test.describe('観戦者', () => {
  test('「得点を入力する」「引き継ぐ」は出ない。担当の名前と、いないことは見える', async ({
    browser,
  }) => {
    await setMatchScorerDirectly(matchIds.live, await findParticipantId(MINAMI.team, MINAMI.name));
    const viewer = await openCourtsAs(browser, 'viewer');

    await expect(
      courtCard(viewer.page, LIVE_COURT).getByText(`${MINAMI_LABEL}さんが入力しています`)
    ).toBeVisible();
    await expect(
      courtCard(viewer.page, OTHER_COURT).getByText('⚠ 入力する人がいません')
    ).toBeVisible();
    await expect(viewer.page.getByRole('button', { name: '得点を入力する' })).toHaveCount(0);
    await expect(viewer.page.getByRole('button', { name: '引き継ぐ' })).toHaveCount(0);

    // 担当の変化はその場で映る
    await clearMatchScorerDirectly(matchIds.live);
    await expect(
      courtCard(viewer.page, LIVE_COURT).getByText('⚠ 入力する人がいません')
    ).toBeVisible({
      timeout: 5000,
    });

    await viewer.context.close();
  });

  test('入口も観戦者は断る（403）。担当は取れない', async ({ browser }) => {
    const viewer = await openCourtsAs(browser, 'viewer');

    const claim = await viewer.page.request.post(`/api/matches/${matchIds.live}/scorer`);
    const release = await viewer.page.request.delete(`/api/matches/${matchIds.live}/scorer`);

    expect(claim.status()).toBe(403);
    expect(release.status()).toBe(403);
    expect((await findMatchScorer(matchIds.live)).participantId).toBeNull();

    await viewer.context.close();
  });
});

/**
 * 画面の崩れ。担当の名前・知らせが出た状態も測る（Playwright で数値を測る。目では判断しない）。
 */
for (const width of [375, 390]) {
  test.describe(`${width}px 幅`, () => {
    async function expectNoOverflow(page: Page, label: string) {
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(innerWidth, label).toBe(width);
      expect(scrollWidth, label).toBe(innerWidth);

      const stickingOut = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="court-card-"]')).flatMap((card) => {
          const cardRect = card.getBoundingClientRect();
          return Array.from(card.querySelectorAll('*'))
            .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
            .filter(
              ({ rect }) =>
                rect.width > 0 &&
                (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5)
            )
            .map(({ text }) => text);
        })
      );
      expect(stickingOut, label).toEqual([]);
    }

    async function tooSmallButtons(scope: Locator) {
      return scope.evaluateAll((buttons) =>
        buttons
          .map((button) => {
            const { width: w, height: h } = button.getBoundingClientRect();
            return { label: button.getAttribute('aria-label') ?? button.textContent, w, h };
          })
          .filter((box) => box.h < 44 || box.w < 44)
      );
    }

    test('担当がいない・ほかの人が担当中・自分が担当・断られた知らせ、どの状態でも横にはみ出さず、ボタンは 44px 以上', async ({
      browser,
    }) => {
      // コート 12 は、ほかの人（愛知北のたろう）が担当中
      await setMatchScorerDirectly(
        matchIds.other,
        await findParticipantId(KITA.team, KITA.name),
        1
      );
      const mine = await openCourtsAs(browser, MINAMI, { viewport: { width, height: 844 } });
      const cards = mine.page.locator('[data-testid^="court-card-"]');

      // 担当がいない（コート 11）と、ほかの人が担当中（コート 12）
      await expect(
        courtCard(mine.page, LIVE_COURT).getByText('⚠ 入力する人がいません')
      ).toBeVisible();
      await expect(
        courtCard(mine.page, OTHER_COURT).getByText(`${KITA_LABEL}さんが入力しています`)
      ).toBeVisible();
      await expectNoOverflow(mine.page, '担当がいない・ほかの人が担当中');
      expect(await tooSmallButtons(cards.locator('button'))).toEqual([]);

      // 引き継ぎの確認画面
      await courtCard(mine.page, OTHER_COURT).getByRole('button', { name: '引き継ぐ' }).click();
      expect(await tooSmallButtons(mine.page.getByRole('dialog').locator('button'))).toEqual([]);
      await mine.page.getByRole('button', { name: '戻る' }).click();

      // 自分が担当（コート 11）と、断られた知らせ
      const card = courtCard(mine.page, LIVE_COURT);
      await takeScorer(card);
      await mine.page.route('**/api/matches/*/scores', (route) =>
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: `${KITA_LABEL}さんが担当しています。`,
            code: 'not-scorer',
          }),
        })
      );
      await plusButton(card, LIVE_A).click();
      await expect(card.getByRole('alert')).toContainText(`${KITA_LABEL}さんが担当しています`);
      await expectNoOverflow(mine.page, '自分が担当・断られた知らせ');
      expect(await tooSmallButtons(cards.locator('button'))).toEqual([]);

      await mine.context.close();
    });
  });
}
