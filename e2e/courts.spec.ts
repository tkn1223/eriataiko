import { expect, test } from '@playwright/test';
import { enterAsViewer } from './helpers/enter';

/**
 * /courts（結果LIVE）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 */

function courtCard(page: import('@playwright/test').Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

/**
 * 折り返さない塊（whitespace-nowrap の span など）が 2 行にまたがっていないかを実測する。
 * 行が変わったかは矩形の上端で見る。矩形の「数」で見ると、React が
 * 「9 - 7」のような文字列を細かい text ノードに分けたときに 1 行でも複数になり、
 * 崩れていないのに崩れたと言ってくる（実際に誤検知した）。
 */
async function chunksSplitAcrossLines(chunks: import('@playwright/test').Locator) {
  return chunks.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const lineTops = new Set(
          Array.from(element.getClientRects(), (rect) => Math.round(rect.top))
        );
        return lineTops.size > 1;
      })
      .map((element) => element.textContent)
  );
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
  await expect(card.getByText('予選 1回戦・1ゲーム目')).toBeVisible();
});

test('各チームの行にペア名・−・＋・得点が出る', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('佐々木・井上')).toBeVisible();
  await expect(card.getByText('田中・木村')).toBeVisible();
  await expect(card.getByRole('button', { name: '佐々木・井上の得点を1増やす' })).toBeVisible();
  await expect(card.getByRole('button', { name: '佐々木・井上の得点を1減らす' })).toBeVisible();
  await expect(card.getByText('20', { exact: true })).toBeVisible();
  await expect(card.getByText('19', { exact: true })).toBeVisible();
});

test('「＋」を押すと得点が1増え、「−」で1減る。0より下にはならない', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 4);
  // コート4 は 加藤・斎藤（B）5点から始まる
  await expect(card.getByText('5', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: '加藤・斎藤の得点を1増やす' }).click();
  await expect(card.getByText('6', { exact: true })).toBeVisible();

  const minus = card.getByRole('button', { name: '加藤・斎藤の得点を1減らす' });
  for (let i = 0; i < 10; i += 1) {
    await minus.click();
  }
  await expect(card.getByText('0', { exact: true })).toBeVisible();
});

test('どちらかが21点に達すると「ゲーム終了」の色が変わる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  const finishButton = card.getByRole('button', { name: 'ゲーム終了' });

  // コート1 は佐々木・井上（A）20点 対 田中・木村（B）19点から始まる
  const before = await finishButton.evaluate((el) => getComputedStyle(el).backgroundColor);

  await card.getByRole('button', { name: '佐々木・井上の得点を1増やす' }).click();
  await expect(card.getByText('21', { exact: true })).toBeVisible();

  const after = await finishButton.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(after).not.toBe(before);
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

test('0対0のコートで「ゲーム終了」を押すと「まだ点が入っていません」と出て、確認画面は出ない', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート3 は 0対0 のまま始まる
  const card = courtCard(page, 3);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();

  await expect(card.getByText('まだ点が入っていません')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('同点で「ゲーム終了」を押すと「同点では終了できません」と出て、確認画面は出ない', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート2 は 山田・中川（A）14点 対 清水・岡本（B）11点から始まる。3点足して同点にする
  const card = courtCard(page, 2);
  const plus = card.getByRole('button', { name: '清水・岡本の得点を1増やす' });
  await plus.click();
  await plus.click();
  await plus.click();

  await card.getByRole('button', { name: 'ゲーム終了' }).click();

  await expect(card.getByText('同点では終了できません')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('「ゲーム終了」を押すと確認画面が出て、まだ画面は変わらない', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('この試合を終了します')).toBeVisible();
  // まだ確定していないので、カードの得点はそのまま
  await expect(card.getByText('20', { exact: true })).toBeVisible();
  await expect(card.getByText('19', { exact: true })).toBeVisible();
});

test('確認画面の「戻る」を押すと何も変わらずに閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await page.getByRole('button', { name: '戻る' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByText(/第\d+ゲーム/)).toHaveCount(0);
  await expect(card.getByText('LIVE')).toBeVisible();
});

test('確認画面は背景タップでも閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await page.getByRole('button', { name: '背景' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('確認画面はEscでも閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('「OK」を押すとそのゲームがチップに並び、次のゲームが0-0で始まる', async ({ page }) => {
  await page.goto('/courts');

  // コート5 は決勝（上限3ゲーム）。第1ゲーム21-19を取り終え、第2ゲームが5-8で進行中。
  // ここでB（藤田・岡田）が第2ゲームを取っても1-1なので、試合はまだ終わらない。
  const card = courtCard(page, 5);
  await expect(card.getByText('決勝トーナメント 準決勝・2ゲーム目')).toBeVisible();

  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await expect(page.getByText('第2ゲームを終了します')).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(card.getByText('第1ゲーム 21-19')).toBeVisible();
  await expect(card.getByText('第2ゲーム 5-8')).toBeVisible();
  await expect(card.getByText('決勝トーナメント 準決勝・3ゲーム目')).toBeVisible();
  // まだ試合は終わっていないので「LIVE」のまま
  await expect(card.getByText('LIVE')).toBeVisible();
});

test('予選（上限1ゲーム）は、確認画面の「OK」で1ゲーム終わると試合終了になる', async ({ page }) => {
  await page.goto('/courts');

  // コート1 は予選（上限1ゲーム）。佐々木・井上（A）20点 対 田中・木村（B）19点
  const card = courtCard(page, 1);
  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(card.getByText('終了')).toBeVisible();
  await expect(card.getByText('LIVE')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'ゲーム終了' })).toHaveCount(0);
  await expect(card.getByText('第1ゲーム 20-19')).toBeVisible();
  await expect(card.getByText('勝ち:', { exact: false })).toBeVisible();
  await expect(card.getByText('1-0', { exact: false })).toBeVisible();
  // 「次」の試合はそのまま出る
  await expect(card.getByText('次')).toBeVisible();
});

test('決勝（上限3ゲーム）で1-1になったら第3ゲームが始まり、その勝者で試合終了になる', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート6 は決勝（上限3ゲーム）。1-1で第3ゲームが 長谷川・五十嵐（A）9点 対 小早川・日下部（B）7点 で進行中
  const card = courtCard(page, 6);
  await expect(card.getByText('決勝トーナメント 準決勝・3ゲーム目')).toBeVisible();

  await card.getByRole('button', { name: 'ゲーム終了' }).click();
  await expect(page.getByText('この試合を終了します')).toBeVisible();
  await expect(page.getByText('試合の勝ち', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'OK' }).click();

  await expect(card.getByText('終了')).toBeVisible();
  await expect(card.getByText('第3ゲーム 9-7')).toBeVisible();
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

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.locator('[data-testid^="court-card-"] span')
    );
    expect(splitAcrossLines).toEqual([]);
  });

  test(`${width}px 幅で、確認画面の文字が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // コート6 は決勝。長い名字どうし（長谷川・五十嵐 / 小早川・日下部）で、
    // 試合の勝ちまで出るいちばん詰まった確認画面を実測する。
    await courtCard(page, 6).getByRole('button', { name: 'ゲーム終了' }).click();

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.getByRole('dialog').locator('span, h2')
    );
    expect(splitAcrossLines).toEqual([]);
  });

  test(`${width}px 幅で、終了したコートの見た目が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // 終了したコートは「勝ち: 長谷川・五十嵐（2-1）」まで出る。ここも実際に終わらせて測る。
    const card = courtCard(page, 6);
    await card.getByRole('button', { name: 'ゲーム終了' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(card.getByText('終了', { exact: true })).toBeVisible();

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.locator('[data-testid^="court-card-"] span')
    );
    expect(splitAcrossLines).toEqual([]);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBe(innerWidth);
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

test('確認画面の「OK」「戻る」はどちらも44px以上', async ({ page }) => {
  await page.goto('/courts');

  await courtCard(page, 1).getByRole('button', { name: 'ゲーム終了' }).click();

  const tooSmall = await page
    .getByRole('dialog')
    .locator('button')
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
  const card = courtCard(page, 4);
  const plus = card.getByRole('button', { name: '加藤・斎藤の得点を1増やす' });
  await plus.scrollIntoViewIfNeeded();

  const box = (await plus.boundingBox())!;
  for (let i = 0; i < 10; i += 1) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  // コート4 は 加藤・斎藤（B）5点から始まる
  await expect(card.getByText('15', { exact: true })).toBeVisible();
});
