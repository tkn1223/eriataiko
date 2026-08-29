import { expect, test } from '@playwright/test';

/**
 * 入場していない人を入場画面へ送る（`src/app/(app)/layout.tsx`）。
 *
 * **これは守りではなく入口の案内。** 書き込みは requirePlayer() が別に
 * 止めており、読み取りは元々誰でも見てよいデータ。ここで確かめたいのは
 * 「いきなり大会の画面に迷い込まないこと」と、
 * **「追い返し続ける輪にならないこと」**の 2 つ。
 *
 * ここでは入場していない状態を作りたいので、他の画面テストと違って
 * enterAsViewer を呼ばない。
 */
test.describe('入場していないとき', () => {
  for (const path of ['/', '/courts', '/matches', '/bracket', '/me']) {
    test(`${path} を開くと入場画面へ送られる`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/enter$/);
      await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
    });
  }

  test('入場画面そのものは送り返されない（輪にならない）', async ({ page }) => {
    await page.goto('/enter');

    await expect(page).toHaveURL(/\/enter$/);
    await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
  });

  test('無い URL は今までどおり「ページがありません」が出る', async ({ page }) => {
    await page.goto('/nothing-here');

    await expect(page).toHaveURL(/\/nothing-here$/);
  });
});

test.describe('入場したあと', () => {
  test('観戦者はそのまま大会の画面を見られる', async ({ page }) => {
    await page.goto('/enter');
    await page.getByRole('button', { name: /観戦の方はこちら/ }).click();
    await expect(page.getByText('観戦中')).toBeVisible();

    await page.goto('/courts');

    await expect(page).toHaveURL(/\/courts$/);
    await expect(page.getByRole('heading', { name: '結果LIVE' })).toBeVisible();
  });

  test('名前で入った人もそのまま見られる', async ({ page }) => {
    await page.goto('/enter');
    await page.getByRole('button', { name: /愛知南/ }).click();
    await page.getByRole('button', { name: /さとう/ }).click();
    // .env.test の合言葉
    await page.getByPlaceholder('当日配布された合言葉').fill('がんばれ2027');
    await page.getByRole('button', { name: '入場する' }).click();
    await expect(page.getByText('入場中')).toBeVisible();

    await page.goto('/courts');

    await expect(page).toHaveURL(/\/courts$/);
    await expect(page.getByRole('heading', { name: '結果LIVE' })).toBeVisible();
  });

  test('退場すると、また入場画面へ送られる', async ({ page }) => {
    await page.goto('/enter');
    await page.getByRole('button', { name: /観戦の方はこちら/ }).click();
    await page.getByRole('button', { name: '観戦をやめる' }).click();
    await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();

    await page.goto('/courts');

    await expect(page).toHaveURL(/\/enter$/);
  });
});
