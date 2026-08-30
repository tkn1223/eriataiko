import { expect, test } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';

/**
 * /courts（結果LIVE）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここでは DB につながった実際の動きと
 * スマホ幅での見え方を確かめる。
 *
 * 使うのは `supabase/seed.sql` の実データ。コート1に 3 試合（終了 / 進行中 / これから）
 * が入っていて、コート1だけがコート割り当てを持つ（他のコートは画面に出ない）。
 */

// seed.sql の固定 id（人以外は id を固定値にしている）。
const MATCH_2_LIVE = '70000000-0000-4000-8000-000000000002'; // コート1・進行中（2部）
const MATCH_2_BASELINE = { gameNumber: 1, sideAScore: 8, sideBScore: 6 };

function courtCard(page: import('@playwright/test').Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

/** テストが得点を動かしても、次のテストが同じ状態から始められるよう戻す。 */
async function resetMatch2Score(page: import('@playwright/test').Page) {
  const response = await page.request.post(`/api/matches/${MATCH_2_LIVE}/scores`, {
    data: MATCH_2_BASELINE,
  });
  if (!response.ok()) {
    throw new Error(`コート1の得点を元に戻せませんでした（${response.status()}）`);
  }
}

test.describe('観戦者として見る', () => {
  test.beforeEach(async ({ page }) => {
    await enterAsViewer(page);
  });

  test('DB の試合が出る（見本の固定8面ではなく、割り当てられたコートだけ）', async ({ page }) => {
    await page.goto('/courts');

    await expect(courtCard(page, 1)).toBeVisible();
    // seed.sql でコートが割り当てられているのはコート1だけ
    await expect(courtCard(page, 2)).toHaveCount(0);
  });

  test('「◯/◯ 試合消化」が DB の試合の数になる（見本の 2/48 ではない）', async ({ page }) => {
    await page.goto('/courts');

    // seed.sql の試合は 6 件、うち終わっている（done）のは 1 件
    await expect(page.getByText('1/6 試合消化')).toBeVisible();
  });

  test('進行中の試合に、DB の得点がそのまま出て「LIVE」になる', async ({ page }) => {
    await page.goto('/courts');

    const card = courtCard(page, 1);
    await expect(card.getByText('LIVE')).toBeVisible();
    await expect(card.getByText('2部')).toBeVisible();
    await expect(card.getByText('予選 1回戦')).toBeVisible();
    await expect(card.getByText('たろう・いとう')).toBeVisible();
    await expect(card.getByText('やまもと・まつもと')).toBeVisible();
    await expect(card.getByText('8', { exact: true })).toBeVisible();
    await expect(card.getByText('6', { exact: true })).toBeVisible();
  });

  test('次の試合が名前だけで出る（部・回戦は同じ対戦の中の別の部の試合）', async ({ page }) => {
    await page.goto('/courts');

    const card = courtCard(page, 1);
    await expect(card.getByText('次')).toBeVisible();
    await expect(card.getByText('さとう・いとう vs わたなべ・まつもと')).toBeVisible();
  });

  test('観戦者には＋−ボタンが出ない', async ({ page }) => {
    await page.goto('/courts');

    const card = courtCard(page, 1);
    await expect(card.getByRole('button', { name: /得点を1増やす/ })).toHaveCount(0);
    await expect(card.getByRole('button', { name: /得点を1減らす/ })).toHaveCount(0);
  });

  test('「まだ保存されません」の帯は出ない（保存できるようになったので）', async ({ page }) => {
    await page.goto('/courts');

    await expect(
      page.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toHaveCount(0);
  });
});

test.describe('参加者として得点を押す', () => {
  test.beforeEach(async ({ page }) => {
    // たろう（愛知南）はコート1の進行中の試合（2部）の当事者
    await enterAsPlayer(page, '愛知南', 'たろう');
    await resetMatch2Score(page);
  });

  test.afterEach(async ({ page }) => {
    await resetMatch2Score(page);
  });

  test('自分の試合に「あなたの試合」の印が出る', async ({ page }) => {
    await page.goto('/courts');

    await expect(courtCard(page, 1).getByText('あなたの試合')).toBeVisible();
  });

  test('＋を押すと得点が1増え、保存される（画面を更新しても残る）', async ({ page }) => {
    await page.goto('/courts');
    const card = courtCard(page, 1);

    await expect(card.getByText('8', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'たろう・いとうの得点を1増やす' }).click();
    await expect(card.getByText('9', { exact: true })).toBeVisible();

    await page.reload();
    await expect(courtCard(page, 1).getByText('9', { exact: true })).toBeVisible();
  });

  test('−を押すと得点が1減る', async ({ page }) => {
    await page.goto('/courts');
    const card = courtCard(page, 1);

    await expect(card.getByText('6', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'やまもと・まつもとの得点を1減らす' }).click();
    await expect(card.getByText('5', { exact: true })).toBeVisible();
  });

  test('−を押しても0より下にはならない', async ({ page }) => {
    await page.goto('/courts');
    const card = courtCard(page, 1);

    const minus = card.getByRole('button', { name: 'やまもと・まつもとの得点を1減らす' });
    for (let i = 0; i < 10; i += 1) {
      await minus.click();
    }
    await expect(card.getByText('0', { exact: true })).toBeVisible();
  });

  test('保存に失敗すると、日本語のエラーが出て DB の本当の値に描き直される', async ({ page }) => {
    await page.goto('/courts');
    const card = courtCard(page, 1);
    await expect(card.getByText('8', { exact: true })).toBeVisible();

    await page.route(`**/api/matches/${MATCH_2_LIVE}/scores`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'サーバー側でエラーが起きました。少し待ってからやり直してください。',
        }),
      })
    );

    await card.getByRole('button', { name: 'たろう・いとうの得点を1増やす' }).click();
    await expect(
      page.getByText('サーバー側でエラーが起きました。少し待ってからやり直してください。')
    ).toBeVisible();

    // 保存に失敗した分は router.refresh() で DB の本当の値（8）に描き直される
    await expect(card.getByText('8', { exact: true })).toBeVisible();
  });

  test('押せるところ（−・＋）はどれも44px以上', async ({ page }) => {
    await page.goto('/courts');

    const tooSmall = await page
      .locator('[data-testid^="court-card-"] button')
      .evaluateAll((buttons) =>
        buttons
          .map((button) => {
            const { width, height } = button.getBoundingClientRect();
            return {
              label: button.getAttribute('aria-label') ?? button.textContent,
              width,
              height,
            };
          })
          .filter((box) => box.height < 44 || box.width < 44)
      );

    expect(tooSmall).toEqual([]);
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
});

test('2つのブラウザで開いて片方で＋を押すと、3秒以内にもう片方の数字が変わる', async ({
  browser,
}) => {
  const playerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    const playerPage = await playerContext.newPage();
    const viewerPage = await viewerContext.newPage();

    await enterAsPlayer(playerPage, '愛知南', 'たろう');
    await resetMatch2Score(playerPage);
    await enterAsViewer(viewerPage);

    await playerPage.goto('/courts');
    await viewerPage.goto('/courts');

    const playerCard = courtCard(playerPage, 1);
    const viewerCard = courtCard(viewerPage, 1);
    await expect(viewerCard.getByText('8', { exact: true })).toBeVisible();

    await playerCard.getByRole('button', { name: 'たろう・いとうの得点を1増やす' }).click();

    await expect(viewerCard.getByText('9', { exact: true })).toBeVisible({ timeout: 3000 });

    await resetMatch2Score(playerPage);
  } finally {
    await playerContext.close();
    await viewerContext.close();
  }
});

test('電波が切れると「画面を更新してください」の帯が出る', async ({ page, context }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  await expect(page.getByText(/画面を更新してください/)).toHaveCount(0);

  // 電波が切れた状態を再現する（Realtime の WebSocket も切れる）。
  // 気づくまで、Realtime のハートビート分の間があく（実測で 10〜11 秒）ので余裕を見る。
  await context.setOffline(true);
  await expect(page.getByText('つながっていません。画面を更新してください。')).toBeVisible({
    timeout: 20_000,
  });

  await context.setOffline(false);
});
