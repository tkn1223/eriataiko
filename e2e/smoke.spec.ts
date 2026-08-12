import { expect, test } from '@playwright/test';

/**
 * 土台が壊れていないことを確かめる最小のテスト。
 * 新しい画面を作ったら e2e/<画面名>.spec.ts を足していく。
 */

test('トップを開くと「現在」に飛ぶ', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/courts$/);
  // タブと URL が対応していることの確認でもある
  await expect(page.getByRole('link', { name: '現在' })).toHaveAttribute('href', '/courts');
});

test('ヘッダーとタブが出る', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'バドミントン大会 進行管理' })).toBeVisible();
  await expect(page.getByRole('link', { name: '現在' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'myページ' })).toBeVisible();
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

test('タブを押すと画面が切り替わる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '順位表' }).click();
  await expect(page).toHaveURL(/\/standings$/);
  await expect(page.getByText('準備中')).toBeVisible();
});
