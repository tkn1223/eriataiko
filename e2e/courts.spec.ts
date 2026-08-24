import { expect, test } from '@playwright/test';
import { enterAsViewer } from './helpers/enter';

/**
 * /courts（結果LIVE）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 */

function courtCard(page: import('@playwright/test').Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

// 大会の画面は入場していないと入場画面へ送られる。中身を見たいので先に入っておく。
test.beforeEach(async ({ page }) => {
  await enterAsViewer(page);
});

test('「予選リーグ」のラベルと「2/48 試合消化」が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(page.getByText('予選リーグ')).toBeVisible();
  await expect(page.getByText('2/48 試合消化')).toBeVisible();
});

test('コートのカードが8枚出る', async ({ page }) => {
  await page.goto('/courts');

  for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
    await expect(courtCard(page, courtNumber)).toBeVisible();
  }
});

test('進行中のコートに「LIVE」と部・回戦・ゲーム目が出る', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('LIVE')).toBeVisible();
  await expect(card.getByText('1部')).toBeVisible();
  await expect(card.getByText('予選 1回戦・2ゲーム目')).toBeVisible();
});

test('各チームの行にペア名・−・＋・得点が出る', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('佐々木・井上')).toBeVisible();
  await expect(card.getByText('田中・木村')).toBeVisible();
  await expect(card.getByRole('button', { name: '佐々木・井上の得点を1増やす' })).toBeVisible();
  await expect(card.getByRole('button', { name: '佐々木・井上の得点を1減らす' })).toBeVisible();
  await expect(card.getByText('15', { exact: true })).toBeVisible();
  await expect(card.getByText('12', { exact: true })).toBeVisible();
});

test('「＋」を押すと得点が1増え、「−」で1減る。0より下にはならない', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 6);
  // コート6 は長谷川・村上（A）5点から始まる
  await expect(card.getByText('5', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: '長谷川・村上の得点を1増やす' }).click();
  await expect(card.getByText('6', { exact: true })).toBeVisible();

  const minus = card.getByRole('button', { name: '長谷川・村上の得点を1減らす' });
  for (let i = 0; i < 10; i += 1) {
    await minus.click();
  }
  await expect(card.getByText('0', { exact: true })).toBeVisible();
});

test('終わったゲームが「第1ゲーム 21-19」のチップで出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 1).getByText('第1ゲーム 21-19')).toBeVisible();
});

test('どちらかが21点に達すると「ゲーム終了」の色が変わる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 2);
  const finishButton = card.getByRole('button', { name: 'ゲーム終了' });

  // コート2 は山田・中川（A）20点 対 清水・岡本（B）19点から始まる
  const before = await finishButton.evaluate((el) => getComputedStyle(el).backgroundColor);

  await card.getByRole('button', { name: '山田・中川の得点を1増やす' }).click();
  await expect(card.getByText('21', { exact: true })).toBeVisible();

  const after = await finishButton.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(after).not.toBe(before);
});

test('「ゲーム終了」を押すと、いまの得点がチップになり、次のゲーム（0-0）が始まる', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート3 は鈴木・高橋（A）14点 対 伊藤・渡辺（B）11点、まだ終わったゲームが無い
  const card = courtCard(page, 3);
  await expect(card.getByText('予選 2回戦・1ゲーム目')).toBeVisible();

  await card.getByRole('button', { name: 'ゲーム終了' }).click();

  await expect(card.getByText('第1ゲーム 14-11')).toBeVisible();
  await expect(card.getByText('予選 2回戦・2ゲーム目')).toBeVisible();
});

test('空いているコートに「呼出待ち」または「予定なし」が状態どおりに出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 7).getByText('呼出待ち')).toBeVisible();
  await expect(courtCard(page, 8).getByText('予定なし')).toBeVisible();
});

test('各コートに「次」の試合が出る。次が無いコートには出ない', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 1).getByText('次')).toBeVisible();
  await expect(courtCard(page, 1).getByText('川口・浜田 vs 小林・西村')).toBeVisible();

  // コート3 は進行中だが、次の試合は無い
  await expect(courtCard(page, 3).getByText('次')).toHaveCount(0);
});

test('自分の試合中のコートに「あなたの試合」の印が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 3).getByText('あなたの試合')).toBeVisible();
});

test('「まだ保存されません」の帯が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(
    page.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
  ).toBeVisible();
});

// 手元に多いのは 390px（iPhone 12 以降）だが、375px（iPhone SE / 8）もまだ使われている
for (const width of [375, 390]) {
  test(`${width}px 幅で、ページ全体が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(innerWidth).toBe(width);
    expect(scrollWidth).toBe(innerWidth);
  });

  test(`${width}px 幅で、ペア名が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // 折り返さない塊が 2 行にまたがっていないかを実測する。
    // 1 行に収まっている要素の矩形は 1 つ、途中で改行された要素は 2 つ以上になる。
    const splitAcrossLines = await page
      .locator('[data-testid^="court-card-"] span')
      .evaluateAll((chunks) =>
        chunks
          .filter((chunk) => chunk.getClientRects().length > 1)
          .map((chunk) => chunk.textContent)
      );
    expect(splitAcrossLines).toEqual([]);
  });
}

test('押せるところ（−・＋・ゲーム終了）はどれも44px以上', async ({ page }) => {
  await page.goto('/courts');

  // 1 つだけ測っても他のコートが小さいままなら意味が無いので、全カードのボタンを測る
  const tooSmall = await page
    .locator('[data-testid^="court-card-"] button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const { width, height } = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label') ?? button.textContent, width, height };
        })
        .filter((box) => box.height < 44 || box.width < 44)
    );

  expect(tooSmall).toEqual([]);
});

test('一番下のコートのカードが下のメニューに隠れない', async ({ page }) => {
  await page.goto('/courts');

  const lastCard = courtCard(page, 8);
  await lastCard.scrollIntoViewIfNeeded();

  // 8 面ぶん縦に並ぶので、最後のカードが貼り付いたメニューの裏に入らないかを実測する
  const cardBox = (await lastCard.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(menuBox.y);
});

test('「＋」を速く連打しても押した回数どおりに増える', async ({ page }) => {
  await page.goto('/courts');

  // 得点係は 1 点ごとに間を空けて押してくれない。押しそこねると試合が止まる。
  const card = courtCard(page, 6);
  const plus = card.getByRole('button', { name: '長谷川・村上の得点を1増やす' });
  await plus.scrollIntoViewIfNeeded();

  const box = (await plus.boundingBox())!;
  for (let i = 0; i < 10; i += 1) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  // コート6 は 5 点から始まる
  await expect(card.getByText('15', { exact: true })).toBeVisible();
});
