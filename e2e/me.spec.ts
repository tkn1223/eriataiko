import { expect, test } from '@playwright/test';

/**
 * /me（マイページ）の画面確認。
 * my-page.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 */

test('/me を開くと選手の名前・チーム名・部・成績・試合一覧が出る', async ({ page }) => {
  await page.goto('/me');

  await expect(page.getByText('佐々木 太郎')).toBeVisible();
  await expect(page.getByText(/アリーナクラブ/)).toBeVisible();
  await expect(page.getByText('3勝1敗')).toBeVisible();
  await expect(page.getByText('今大会の試合')).toBeVisible();
});

test('「名前を変更」を押すと「準備中」と出て、画面は切り替わらない', async ({ page }) => {
  await page.goto('/me');

  await page.getByRole('button', { name: '名前を変更' }).click();
  await expect(page.getByText('準備中')).toBeVisible();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText('佐々木 太郎')).toBeVisible();
});

test('390px 幅で横にはみ出さない', async ({ page }) => {
  await page.goto('/me');

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(390);
  expect(scrollWidth).toBe(innerWidth);

  // 丸バッジの文字（LIVE など）が丸からはみ出していないか
  const badgesOverflowing = await page
    .locator('li[data-testid^="match-"] span[role="img"]')
    .evaluateAll((badges) =>
      badges
        .filter((badge) => badge.scrollWidth > badge.clientWidth)
        .map((badge) => badge.textContent)
    );
  expect(badgesOverflowing).toEqual([]);
});

// 実機は 375px（iPhone SE / mini）もある。狭いほうで崩れやすいので両方見る。
for (const width of [375, 390]) {
  test(`${width}px 幅で、試合カードの文字が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/me');

    // 「とペア」「2部」が枠に入りきらず消えたことがあるので、幅と高さを実測して見張る
    const clipped = await page
      .locator('li[data-testid^="match-"] p')
      .evaluateAll((lines) =>
        lines
          .filter(
            (line) => line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight
          )
          .map((line) => line.textContent)
      );
    expect(clipped).toEqual([]);
  });

  test(`${width}px 幅で、言葉の途中で改行しない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/me');

    // 折り返さない塊（回戦名・ペア・部・相手の名前）が 2 行にまたがっていないかを実測する。
    // 1 行に収まっている要素の矩形は 1 つ、途中で改行された要素は 2 つになる。
    const splitAcrossLines = await page
      .locator('li[data-testid^="match-"] p span')
      .evaluateAll((chunks) =>
        chunks
          .filter((chunk) => chunk.getClientRects().length > 1)
          .map((chunk) => chunk.textContent)
      );
    expect(splitAcrossLines).toEqual([]);
  });
}

test('一番下の試合が、下のメニューに隠れない', async ({ page }) => {
  await page.goto('/me');

  const lastCard = page.locator('li[data-testid^="match-"]').last();
  // 一番下までスクロールした状態で見る（Konsta の Page が動くので window ではなくカード基準）
  await lastCard.evaluate((card) => card.scrollIntoView({ block: 'end' }));

  const lastCardBox = (await lastCard.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  // 実際に測って比べる（見た目で「隠れていなさそう」と判断しない）
  expect(lastCardBox.y + lastCardBox.height).toBeLessThanOrEqual(menuBox.y);
});
