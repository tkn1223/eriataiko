import { expect, test } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import {
  createLongNamePlayer,
  deleteLongNamePlayer,
  LONG_NAME_PLAYER,
  LONG_NAME_TEAM,
} from './helpers/long-name-player';

/**
 * /me（マイページ）の画面確認。
 * my-page.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方と、
 * 本物のデータ（supabase/seed.sql）につながっていることを確かめる。
 *
 * seed.sql の「さとう」（愛知南 #1）は
 * 1 試合目（終了・side a・15-11・max_game_count 1）と
 * 3 試合目（未実施・コート1・3試合目）に出る。
 */

test('選手として入場すると、本物の名前・チーム名・成績・試合一覧が出る（見本データは出ない）', async ({
  page,
}) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  await expect(page.getByText('さとう')).toBeVisible();
  await expect(page.getByText(/愛知南/)).toBeVisible();
  await expect(page.getByText('1勝0敗')).toBeVisible();
  await expect(page.getByText('今大会の試合')).toBeVisible();

  await expect(page.getByText('佐々木 太郎')).toHaveCount(0);
  await expect(page.getByText('アリーナクラブ')).toHaveCount(0);
});

test('「別の人として入り直す」を押すと入場画面（/enter）に移る', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  await page.getByRole('link', { name: '別の人として入り直す' }).click();
  await expect(page).toHaveURL(/\/enter$/);
});

test('観戦者で開くと「観戦モード」が出て、成績や試合一覧は出ない', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/me');

  await expect(page.getByText('観戦モード')).toBeVisible();
  await expect(page.getByText('今大会の試合')).toHaveCount(0);
});

test('観戦者の「選手として入り直す」を押すと入場画面（/enter）に移る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/me');

  await page.getByRole('link', { name: '選手として入り直す' }).click();
  await expect(page).toHaveURL(/\/enter$/);
});

// 体育館で汗ばんだ指で押される。小さいと押し損ねるので、実際の高さを測る（AGENTS.md）。
test('入り直すリンクは、指で押せる大きさ（高さ 44px 以上）がある', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');
  const playerLink = (await page
    .getByRole('link', { name: '別の人として入り直す' })
    .boundingBox())!;
  expect(playerLink.height).toBeGreaterThanOrEqual(44);

  await enterAsViewer(page);
  await page.goto('/me');
  const viewerLink = (await page.getByRole('link', { name: '選手として入り直す' }).boundingBox())!;
  expect(viewerLink.height).toBeGreaterThanOrEqual(44);
});

test('390px 幅で横にはみ出さない', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
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
    await enterAsPlayer(page, '愛知南', 'さとう');
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
    await enterAsPlayer(page, '愛知南', 'さとう');
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

/**
 * seed.sql の名前は「さとう」など短いものばかり。**崩れるのは長い名前のとき**で、
 * この形（長い回戦名 ＋ 空白入りの長い名前 ＋ 3 ゲームの得点）で
 * 「とペア」「3部」が消える崩れが実際に見つかった。部が無い人も一緒に確かめる。
 */
test.describe('長い名前・部が無い人', () => {
  test.beforeAll(createLongNamePlayer);
  test.afterAll(deleteLongNamePlayer);

  for (const width of [375, 390]) {
    test(`${width}px 幅で、長い名前でも文字が切れず、言葉の途中で改行しない`, async ({ page }) => {
      await enterAsPlayer(page, LONG_NAME_TEAM, LONG_NAME_PLAYER);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/me');

      // 部が無い人でも見出しは崩れない（「・」だけが浮かない）
      await expect(page.getByText(LONG_NAME_PLAYER)).toBeVisible();
      await expect(page.getByText(LONG_NAME_TEAM, { exact: true })).toBeVisible();

      const measured = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clipped: [...document.querySelectorAll('li[data-testid^="match-"] p')]
          .filter(
            (line) => line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight
          )
          .map((line) => line.textContent),
        splitAcrossLines: [...document.querySelectorAll('li[data-testid^="match-"] p span')]
          .filter((chunk) => chunk.getClientRects().length > 1)
          .map((chunk) => chunk.textContent),
      }));

      expect(measured.scrollWidth).toBe(measured.innerWidth);
      expect(measured.clipped).toEqual([]);
      expect(measured.splitAcrossLines).toEqual([]);
    });
  }

  /**
   * 進行中の試合は「ゲーム ◯-◯」を出さない（どのゲームが終わったかが表に無いため）。
   * 見本データ（さとう）には進行中の試合が無いので、ここで作った人で確かめる。
   */
  for (const width of [375, 390]) {
    test(`${width}px 幅で、進行中の試合にはゲーム数を出さず、各ゲームの得点だけ出す`, async ({
      page,
    }) => {
      await enterAsPlayer(page, LONG_NAME_TEAM, LONG_NAME_PLAYER);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/me');

      const liveCard = page
        .locator('li[data-testid^="match-"]')
        .filter({ has: page.getByRole('img', { name: '進行中' }) });
      await expect(liveCard.getByTestId('game-count')).toHaveCount(0);
      await expect(liveCard.getByText('11-21 / 8-6')).toBeVisible();

      // 終了した試合はこれまでどおりゲーム数と各ゲームの得点が出る
      const doneCard = page
        .locator('li[data-testid^="match-"]')
        .filter({ has: page.getByRole('img', { name: '勝ち' }) });
      await expect(doneCard.getByTestId('game-count')).toHaveText('2-1');
      await expect(doneCard.getByText('21-19 / 18-21 / 21-15')).toBeVisible();

      // ゲーム数の行が無くなっても、進行中のカードが崩れないことを実測する
      const measured = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clipped: [...document.querySelectorAll('li[data-testid^="match-"] p')]
          .filter(
            (line) => line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight
          )
          .map((line) => line.textContent),
      }));
      expect(measured.scrollWidth).toBe(measured.innerWidth);
      expect(measured.clipped).toEqual([]);
    });
  }
});

test('一番下の試合が、下のメニューに隠れない', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  const lastCard = page.locator('li[data-testid^="match-"]').last();
  // 一番下までスクロールした状態で見る（Konsta の Page が動くので window ではなくカード基準）
  await lastCard.evaluate((card) => card.scrollIntoView({ block: 'end' }));

  const lastCardBox = (await lastCard.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  // 実際に測って比べる（見た目で「隠れていなさそう」と判断しない）
  expect(lastCardBox.y + lastCardBox.height).toBeLessThanOrEqual(menuBox.y);
});
