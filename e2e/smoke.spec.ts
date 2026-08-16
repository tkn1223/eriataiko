import { expect, test } from '@playwright/test';

/**
 * 土台が壊れていないことを確かめる最小のテスト。
 * 新しい画面を作ったら e2e/<画面名>.spec.ts を足していく。
 */

test('トップを開くと「結果LIVE」に飛ぶ', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/courts$/);
  // メニューと URL が対応していることの確認でもある
  await expect(page.getByRole('link', { name: /結果LIVE/ })).toHaveAttribute('href', '/courts');
});

test('ヘッダーと下のメニューが出る', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'バドミントン大会 進行管理' })).toBeVisible();
  await expect(page.getByRole('link', { name: /結果LIVE/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /myページ/ })).toBeVisible();
});

test('スマホ幅（390px）で横にはみ出さない', async ({ page }) => {
  await page.goto('/');
  // 「見た目で判断」だと嘘をつくので、実際の幅を測って比べる
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(innerWidth).toBe(390);
  expect(scrollWidth).toBe(innerWidth);
});

test('メニューは画面の一番下に貼り付いている', async ({ page }) => {
  await page.goto('/');

  const menu = page.getByRole('navigation', { name: 'メインメニュー' });
  const menuBox = (await menu.boundingBox())!;
  const viewportHeight = page.viewportSize()!.height;

  // 「見た目で判断」だと嘘をつくので、実際の位置を測る
  expect(menuBox.y + menuBox.height).toBe(viewportHeight);

  // 汗ばんだ指でも押せる大きさか（Apple / Google の指針が 44px 以上）
  const linkBox = (await page.getByRole('link', { name: /結果LIVE/ }).boundingBox())!;
  expect(linkBox.height).toBeGreaterThanOrEqual(44);
});

test('スクロールしてもメニューは消えない', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => window.scrollBy(0, 500));
  await expect(page.getByRole('link', { name: /結果LIVE/ })).toBeInViewport();
});

test('メニューを押すと画面が切り替わる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /対戦表/ }).click();
  await expect(page).toHaveURL(/\/bracket$/);
  await expect(page.getByText('準備中！！')).toBeVisible();
});
