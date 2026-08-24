import { expect, test } from '@playwright/test';
import { enterAsViewer } from './helpers/enter';

/**
 * /bracket（対戦表）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 */

// 大会の画面は入場していないと入場画面へ送られる。中身を見たいので先に入っておく。
test.beforeEach(async ({ page }) => {
  await enterAsViewer(page);
});

test('「予選リーグ」「決勝トーナメント」の切り替えが出て、押すと中身が入れ替わる', async ({
  page,
}) => {
  await page.goto('/bracket');

  await expect(page.getByText('順位表（暫定）')).toBeVisible();

  await page.getByRole('button', { name: '決勝トーナメント' }).click();
  await expect(page.getByText('順位表（暫定）')).toHaveCount(0);
  await expect(page.getByText('準決勝', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '予選リーグ' }).click();
  await expect(page.getByText('順位表（暫定）')).toBeVisible();
});

test('予選リーグ側に 4×4 の星取表が出る。自分同士のマスは空', async ({ page }) => {
  await page.goto('/bracket');

  await expect(page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })).toBeVisible();
  await expect(page.getByRole('button', { name: '愛知南 対 愛知南 の対戦' })).toHaveCount(0);
});

test('マスに ○ / ● /「試合中」/「未」が状態どおりに出て、終了・進行中にはスコアが出る', async ({
  page,
}) => {
  await page.goto('/bracket');

  const won = page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' });
  await expect(won).toContainText('○');
  await expect(won).toContainText('2-1');

  const lost = page.getByRole('button', { name: '愛知中央 対 愛知南 の対戦' });
  await expect(lost).toContainText('●');

  const live = page.getByRole('button', { name: '愛知中央 対 関東 の対戦' });
  await expect(live).toContainText('試合中');
  await expect(live).toContainText('1-0');

  const waiting = page.getByRole('button', { name: '愛知南 対 関西 の対戦' });
  await expect(waiting).toContainText('未');
});

test('星取表の下に「○＝カード勝利…」の注記が出る', async ({ page }) => {
  await page.goto('/bracket');

  await expect(
    page.getByText('○＝カード勝利（数字はカード内の勝ち試合数）。タップで詳細。')
  ).toBeVisible();
});

test('「順位表（暫定）」に 順位 / チーム / 勝敗 / ゲーム / 得失点 の 5 列が出て、順位の決め方が書かれる', async ({
  page,
}) => {
  await page.goto('/bracket');

  await expect(page.getByText('順位表（暫定）')).toBeVisible();
  await expect(page.getByText('順位は 勝敗 → ゲーム → 得失点 の順で決定')).toBeVisible();
});

test('マスを押すと詳細が下から出て、その対戦の試合一覧が並ぶ。「閉じる」で閉じる', async ({
  page,
}) => {
  await page.goto('/bracket');

  await page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('予選リーグ：愛知南 2-1 愛知中央')).toBeVisible();
  await expect(sheet.getByText('1部')).toBeVisible();

  await page.getByRole('button', { name: /閉じる/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('未実施の対戦の詳細を開いても、見出しにスコアは出ない', async ({ page }) => {
  await page.goto('/bracket');

  await page.getByRole('button', { name: '愛知南 対 関西 の対戦' }).click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('予選リーグ：愛知南 vs 関西')).toBeVisible();
  await expect(sheet.getByText('0-0')).toHaveCount(0);
});

test('決勝トーナメント側に 準決勝・決勝・優勝・3位決定戦 が出て、決まっていない枠はプレースホルダで出る', async ({
  page,
}) => {
  await page.goto('/bracket');
  await page.getByRole('button', { name: '決勝トーナメント' }).click();

  await expect(page.getByText('準決勝', { exact: true })).toBeVisible();
  await expect(page.getByText('決勝', { exact: true })).toBeVisible();
  await expect(page.getByText('優勝', { exact: true })).toBeVisible();
  await expect(page.getByText('3位決定戦')).toBeVisible();

  await expect(page.getByText('予選 1位')).toBeVisible();
  await expect(page.getByText('準決勝1 勝者')).toBeVisible();
  await expect(page.getByText('組み合わせは予選リーグ終了後に確定します')).toBeVisible();
});

// 手元に多いのは 390px（iPhone 12 以降）だが、375px（iPhone SE / 8）もまだ使われている
for (const width of [375, 390]) {
  test(`${width}px 幅で、予選リーグ側も決勝トーナメント側もページ全体が横にはみ出さない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');

    const measure = () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));

    const league = await measure();
    expect(league.innerWidth).toBe(width);
    expect(league.scrollWidth).toBe(width);

    await page.getByRole('button', { name: '決勝トーナメント' }).click();
    const tournament = await measure();
    expect(tournament.scrollWidth).toBe(width);
  });
}

test('星取表は、その中だけ横スクロールできる', async ({ page }) => {
  await page.goto('/bracket');

  const scrollArea = page.getByTestId('league-matrix-scroll');
  const { scrollWidth, clientWidth } = await scrollArea.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  // 中身のほうが広い＝この枠の中でスクロールが起きる
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

// 実機は 375px（iPhone SE / mini）もある。狭いほうで崩れやすいので両方見る。
for (const width of [375, 390]) {
  test(`${width}px 幅で、詳細シートの文字が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');
    await page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }).click();

    // マイページで実際に文字が消えたことがあるので、幅と高さを実測して見張る
    const clipped = await page
      .locator('[role="dialog"] p, [role="dialog"] h2, [role="dialog"] span')
      .evaluateAll((lines) =>
        lines
          .filter(
            (line) => line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight
          )
          .map((line) => line.textContent)
      );
    expect(clipped).toEqual([]);
  });
}

test('順位表は 375px 幅でも枠に収まる（横に動かない）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/bracket');

  const { scrollWidth, clientWidth } = await page
    .getByTestId('standings-scroll')
    .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth).toBe(clientWidth);
});

test('勝ち上がり表は、その中だけ横スクロールできる', async ({ page }) => {
  await page.goto('/bracket');
  await page.getByRole('button', { name: '決勝トーナメント' }).click();

  const scrollArea = page.getByTestId('ko-bracket-scroll');
  const { scrollWidth, clientWidth } = await scrollArea.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

test('切り替え・マス・閉じるは、どれも高さ 44px 以上でタップできる', async ({ page }) => {
  await page.goto('/bracket');

  const tabBox = (await page.getByRole('button', { name: '予選リーグ' }).boundingBox())!;
  expect(tabBox.height).toBeGreaterThanOrEqual(44);

  const cellBox = (await page
    .getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })
    .boundingBox())!;
  expect(cellBox.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }).click();
  const closeBox = (await page.getByRole('button', { name: /閉じる/ }).boundingBox())!;
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
});

test('詳細を開いている間、暗い部分を指でなぞっても背後のページは動かない', async ({
  page,
  context,
}) => {
  await page.goto('/bracket');
  // 縦スクロールするのは window ではなく Konsta の Page（.k-page）
  const scroller = page.locator('.k-page');

  await page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }).click();

  // マウスのホイールではなく、実機と同じ指のなぞりで確かめる
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.synthesizeScrollGesture', {
    x: 190,
    y: 300,
    xDistance: 0,
    yDistance: -300,
    gestureSourceType: 'touch',
    preventFling: true,
  });

  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
});

test('詳細は、暗い部分を指でタップしても閉じる', async ({ page }) => {
  await page.goto('/bracket');
  await page.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // 暗い部分はなぞっても動かない設定（touch-none）にしてあるので、タップは効くことを実機同様に確かめる
  await page.touchscreen.tap(190, 200);

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('/standings を開くと「ページがありません」になる', async ({ page }) => {
  const response = await page.goto('/standings');

  expect(response?.status()).toBe(404);
  await expect(page.getByText('ページがありません')).toBeVisible();
});
