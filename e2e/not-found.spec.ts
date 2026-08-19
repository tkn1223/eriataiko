import { expect, test } from '@playwright/test';

/**
 * 無いページを開いたときの画面。
 * Next.js の標準は英語（"404 This page could not be found."）なので、
 * 日本語で出ていることと、戻り道があることを確かめる。
 */

test('無い URL を開くと「ページがありません」と日本語で出る', async ({ page }) => {
  const response = await page.goto('/nothing-here');

  expect(response?.status()).toBe(404);
  await expect(page.getByText('ページがありません')).toBeVisible();
});

test('「結果LIVE へ戻る」を押すと結果LIVE に戻る', async ({ page }) => {
  await page.goto('/nothing-here');

  const backLink = page.getByRole('link', { name: /結果LIVE/ });
  // 体育館で汗ばんだ指でも押せる大きさか（Apple / Google の指針が 44px 以上）
  const box = (await backLink.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);

  await backLink.click();
  await expect(page).toHaveURL(/\/courts$/);
});

test('390px 幅で横にはみ出さない', async ({ page }) => {
  await page.goto('/nothing-here');

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(390);
  expect(scrollWidth).toBe(innerWidth);
});
