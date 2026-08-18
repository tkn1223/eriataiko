import { expect, test } from '@playwright/test';

/**
 * /matches（進行表）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 */

// 見出しの文字列は区切りの空白を挟まず連結される（例: 「コート1現在3試合目残り4試合」）。
// 「コート1」の直後に別の数字が続かないことだけを見て、他のコート番号と区別する。
function courtHeadingName(courtNumber: number) {
  return new RegExp(`^コート${courtNumber}(?!\\d)`);
}

test('「全試合」「自分の試合」の絞り込みが出て、押すと並ぶ試合が変わる', async ({ page }) => {
  await page.goto('/matches');

  await expect(page.getByRole('button', { name: '全試合' })).toBeVisible();
  await expect(page.getByRole('button', { name: '自分の試合' })).toBeVisible();

  // 絞り込み前はコート8（予定なし・自分の試合を含まない）の見出しが出る
  await expect(page.getByRole('button', { name: courtHeadingName(8) })).toBeVisible();

  await page.getByRole('button', { name: '自分の試合' }).click();
  await expect(page.getByRole('button', { name: courtHeadingName(8) })).toHaveCount(0);

  await page.getByRole('button', { name: '全試合' }).click();
  await expect(page.getByRole('button', { name: courtHeadingName(8) })).toBeVisible();
});

test('コートごとのカードが8枚出て、見出しを押すと中身が開いたり閉じたりする', async ({ page }) => {
  await page.goto('/matches');

  for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
    await expect(page.getByRole('button', { name: courtHeadingName(courtNumber) })).toBeVisible();
  }

  const heading = page.getByRole('button', { name: courtHeadingName(1) });
  await expect(heading).toHaveAttribute('aria-expanded', 'false');

  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');

  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
});

test('見出しに「残り◯試合」／「すべて終了」／「予定なし」が状態どおりに出る', async ({ page }) => {
  await page.goto('/matches');

  // コート1 は 2 試合が終了、1 試合が進行中、3 試合がこれから。進行中も残りに数えて 4 試合。
  await expect(page.getByRole('button', { name: courtHeadingName(1) })).toContainText('残り4試合');
  await expect(page.getByRole('button', { name: courtHeadingName(7) })).toContainText('すべて終了');
  await expect(page.getByRole('button', { name: courtHeadingName(8) })).toContainText('予定なし');
});

test('進行中の試合があるコートの見出しに「現在◯試合目」が出る', async ({ page }) => {
  await page.goto('/matches');

  await expect(page.getByRole('button', { name: courtHeadingName(1) })).toContainText(
    '現在3試合目'
  );
});

test('試合の行に 試合順・部・両ペアの名前・スコアが出て、進行中の行には LIVE が出る', async ({
  page,
}) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();

  const liveRow = page.getByTestId('match-row-c1-3');
  await expect(liveRow).toContainText('3試合目');
  await expect(liveRow).toContainText('3部');
  await expect(liveRow).toContainText('中村');
  await expect(liveRow).toContainText('加藤');
  await expect(liveRow).toContainText('21-19 / 12-9');
  await expect(liveRow).toContainText('LIVE');
});

test('自分の試合には「あなたの試合」の印が出る', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();
  await page.getByRole('button', { name: '✓ 終了した2試合を見る' }).click();

  await expect(page.getByTestId('match-row-c1-2')).toContainText('あなたの試合');
});

test('終わった試合は最初は隠れていて、「✓ 終了した◯試合を見る」を押すと出る', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();

  await expect(page.getByTestId('match-row-c1-1')).toHaveCount(0);

  await page.getByRole('button', { name: '✓ 終了した2試合を見る' }).click();
  await expect(page.getByTestId('match-row-c1-1')).toBeVisible();
  await expect(page.getByRole('button', { name: '✓ 終了した2試合を隠す' })).toBeVisible();
});

test('進行中の行を押すと得点入力が下から出る。終わった試合・これからの試合は押せない', async ({
  page,
}) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();

  // これからの試合（c1-4）はボタンではない
  await expect(page.getByTestId('match-row-c1-4').getByRole('button')).toHaveCount(0);

  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('コート1 ・ [3部] 予選 2回戦')).toBeVisible();
});

test('得点入力で「＋1」を押すと数字が1増え、「−1」で1減る。0より下にはならない', async ({
  page,
}) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();
  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('12', { exact: true })).toBeVisible();
  await expect(sheet.getByText('9', { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: '＋1' }).first().click();
  await expect(sheet.getByText('13', { exact: true })).toBeVisible();

  const minusButtons = sheet.getByRole('button', { name: '−1' });
  for (let i = 0; i < 15; i += 1) {
    await minusButtons.nth(1).click();
  }
  await expect(sheet.getByText('0', { exact: true })).toBeVisible();
});

test('得点入力に「まだ保存されません」の注意書きが出る', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();
  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

  await expect(
    page.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
  ).toBeVisible();
});

test('得点入力は「閉じる」「背景」「Esc」のどれでも閉じる', async ({ page }) => {
  await page.goto('/matches');
  await page.getByRole('button', { name: courtHeadingName(1) }).click();

  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();
  await page.getByRole('button', { name: /閉じる/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();
  // シートは画面の下側だけを覆う。「背景」ボタンの中心（画面中央）はシートに隠れて
  // 押せないことがある（bracket と同じ理由）ので、シートに隠れない上のほうを指でタップする。
  await page.touchscreen.tap(190, 80);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// 手元に多いのは 390px（iPhone 12 以降）だが、375px（iPhone SE / 8）もまだ使われている
for (const width of [375, 390]) {
  test(`${width}px 幅で、ページ全体が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/matches');

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      await page.getByRole('button', { name: courtHeadingName(courtNumber) }).click();
    }
    await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(innerWidth).toBe(width);
    expect(scrollWidth).toBe(innerWidth);
  });

  test(`${width}px 幅で、言葉が途中で改行・途中で切れていない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/matches');

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      await page.getByRole('button', { name: courtHeadingName(courtNumber) }).click();
    }
    // 終了した試合も出した状態で測る。押すと文言が「隠す」に変わるので、
    // 「見る」が無くなるまで先頭を押していけば全部開く。
    const doneToggles = page.getByRole('button', { name: /終了した\d+試合を見る/ });
    for (let remaining = await doneToggles.count(); remaining > 0; remaining -= 1) {
      await doneToggles.first().click();
    }

    // 実測して、はみ出したり途中で改行された文字が無いかを見る
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

    await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();
    const sheetClipped = await page
      .locator('[role="dialog"] p, [role="dialog"] h2, [role="dialog"] span')
      .evaluateAll((lines) =>
        lines
          .filter(
            (line) => line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight
          )
          .map((line) => line.textContent)
      );
    expect(sheetClipped).toEqual([]);
  });

  // 得点は 2 桁になり、ペアは 2 人ぶんの名前が並ぶ。いちばん幅を食う組み合わせで測る。
  test(`${width}px 幅で、得点が2桁・ペアが2人でも得点入力の枠が崩れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/matches');

    await page.getByRole('button', { name: courtHeadingName(3) }).click();
    await page.getByRole('button', { name: '松井・菊地 対 和田・荒木 の試合' }).click();

    const sheet = page.getByRole('dialog');
    // 10-10 から 21 まで押し上げて、2 桁になっても枠が変わらないことを見る
    const beforeWidth = (await sheet.boundingBox())!.width;
    for (let i = 0; i < 11; i += 1) {
      await sheet.getByRole('button', { name: '＋1' }).first().click();
    }
    await expect(sheet.getByText('21', { exact: true })).toBeVisible();

    const afterBox = (await sheet.boundingBox())!;
    expect(afterBox.width).toBe(beforeWidth);

    const { pageScrollWidth, innerWidth } = await page.evaluate(() => ({
      pageScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(pageScrollWidth).toBe(innerWidth);

    const clipped = await sheet
      .locator('p, h2, span, li, button')
      .evaluateAll((parts) =>
        parts.filter((part) => part.scrollWidth > part.clientWidth).map((part) => part.textContent)
      );
    expect(clipped).toEqual([]);
  });
}

test('得点入力を開いている間、暗い部分を指でなぞっても背後のページは動かない', async ({
  page,
  context,
}) => {
  await page.goto('/matches');
  // 縦スクロールするのは window ではなく Konsta の Page（.k-page）
  const scroller = page.locator('.k-page');

  await page.getByRole('button', { name: courtHeadingName(1) }).click();
  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

  // マウスのホイールではなく、実機と同じ指のなぞりで確かめる
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 190,
    y: 200,
    xDistance: 0,
    yDistance: -300,
    gestureSourceType: 'touch',
    preventFling: true,
  });

  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
});

test('押せるところ（絞り込み・コートの見出し・行・＋1／−1・閉じる）はどれも44px以上', async ({
  page,
}) => {
  await page.goto('/matches');

  const allBox = (await page.getByRole('button', { name: '全試合' }).boundingBox())!;
  expect(allBox.height).toBeGreaterThanOrEqual(44);

  const mineBox = (await page.getByRole('button', { name: '自分の試合' }).boundingBox())!;
  expect(mineBox.height).toBeGreaterThanOrEqual(44);

  const headingBox = (await page.getByRole('button', { name: courtHeadingName(1) }).boundingBox())!;
  expect(headingBox.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: courtHeadingName(1) }).click();

  const rowBox = (await page.getByRole('button', { name: '中村 対 加藤 の試合' }).boundingBox())!;
  expect(rowBox.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: '中村 対 加藤 の試合' }).click();

  const sheet = page.getByRole('dialog');
  const plusBox = (await sheet.getByRole('button', { name: '＋1' }).first().boundingBox())!;
  expect(plusBox.height).toBeGreaterThanOrEqual(44);

  const minusBox = (await sheet.getByRole('button', { name: '−1' }).first().boundingBox())!;
  expect(minusBox.height).toBeGreaterThanOrEqual(44);

  const closeBox = (await sheet.getByRole('button', { name: /閉じる/ }).boundingBox())!;
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
});
