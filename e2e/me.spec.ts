import { expect, test } from '@playwright/test';
import { loadTestEnv } from '../tests/load-env.mjs';
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
 * 仕様: docs/specs/2026-11-22-me-redesign.md
 *
 * seed.sql の「さとう」（愛知南 #1）は
 * 1 試合目（終了・side a・15-11・max_game_count 1）と
 * 3 試合目（未実施・コート1・3試合目）に出る。
 */

test('選手として入場すると、本物の名前・チーム名・次の試合・終わった試合が出る（見本データは出ない）', async ({
  page,
}) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  const heading = page.getByTestId('my-heading');
  await expect(heading.getByText('さとう')).toBeVisible();
  await expect(heading.getByText('愛知南')).toBeVisible();

  const next = page.getByTestId('next-match');
  await expect(next.getByText('次の試合')).toBeVisible();
  await expect(next.getByText('コート1')).toBeVisible();
  await expect(next.getByText('3試合目')).toBeVisible();

  await expect(page.getByText('終わった試合')).toBeVisible();
  await expect(page.getByTestId('finished-heading').getByText('1勝0敗')).toBeVisible();

  await expect(page.getByText('佐々木 太郎')).toHaveCount(0);
  await expect(page.getByText('アリーナクラブ')).toHaveCount(0);
});

test('「‹ 名前を選ぶ画面に戻る」を押すと退場して、チームを選ぶ最初の画面に移る', async ({
  page,
}) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  await page.getByRole('button', { name: '‹ 名前を選ぶ画面に戻る' }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
});

test('観戦者で開くと、myページの中に名前選びが出て、下のメニューも残る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/me');

  await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
  // 大会名の見出しと観戦ボタンは出さない
  await expect(page.getByRole('button', { name: /観戦の方はこちら/ })).toHaveCount(0);
  await expect(page.getByText('myページ · 名前を選ぶ')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeVisible();
  await expect(page.getByText('観戦モード')).toHaveCount(0);
});

test('観戦者が名前を選んで入ると、そのまま自分の myページが出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/me');

  await page.getByRole('button', { name: /愛知南/ }).click();
  await page.getByRole('button', { name: /さとう/ }).click();
  await page.getByPlaceholder('当日配布された合言葉').fill(loadTestEnv().TOURNAMENT_PASSCODE);
  await page.getByRole('button', { name: '入場する' }).click();

  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId('my-heading').getByText('さとう')).toBeVisible();
  await expect(page.getByTestId('next-match')).toBeVisible();
});

// 体育館で汗ばんだ指で押される。小さいと押し損ねるので、実際の高さを測る（AGENTS.md）。
test('戻るボタンは、指で押せる大きさ（高さ 44px 以上）がある', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');
  const box = (await page.getByRole('button', { name: '‹ 名前を選ぶ画面に戻る' }).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
});

// 実機は 375px（iPhone SE / mini）もある。狭いほうで崩れやすいので両方見る。
for (const width of [375, 390]) {
  test(`${width}px 幅で、横にはみ出さず、次の試合の文字が途中で切れない`, async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'さとう');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/me');

    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      clipped: [
        ...document.querySelectorAll('[data-testid="next-match"] *, li[data-testid^="match-"] *'),
      ]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
        .map((el) => el.textContent),
    }));
    expect(measured.innerWidth).toBe(width);
    expect(measured.scrollWidth).toBe(measured.innerWidth);
    expect(measured.clipped).toEqual([]);
  });
}

/**
 * seed.sql の名前は「さとう」など短いものばかり。**崩れるのは長い名前のとき**。
 * 長い回戦名 ＋ 空白入りの長い名前 ＋ 3 ゲームの得点で確かめる。
 * この人の試合中の試合は myページに出ない（出ていないことも確かめる）。
 */
test.describe('長い名前の人', () => {
  test.beforeAll(createLongNamePlayer);
  test.afterAll(deleteLongNamePlayer);

  for (const width of [375, 390]) {
    test(`${width}px 幅で、長い名前・長い回戦名・3 ゲームでも横にはみ出さず、試合中は出ない`, async ({
      page,
    }) => {
      await enterAsPlayer(page, LONG_NAME_TEAM, LONG_NAME_PLAYER);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/me');

      await expect(page.getByTestId('my-heading').getByText(LONG_NAME_PLAYER)).toBeVisible();
      await expect(page.getByTestId('next-match').getByText('コート12')).toBeVisible();
      // 終わった試合（3 ゲーム）
      await expect(
        page.getByTestId('finished-card').getByText('21-19 / 18-21 / 21-15')
      ).toBeVisible();
      await expect(page.getByTestId('finished-card').getByTestId('game-count')).toHaveText('2-1');
      // 試合中の点は出さない
      await expect(page.getByText('11-21 / 8-6')).toHaveCount(0);

      const measured = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clipped: [
          ...document.querySelectorAll('[data-testid="next-match"] *, li[data-testid^="match-"] *'),
        ]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
          .map((el) => el.textContent),
        // 折り返さない塊（ペア・相手の名前）が 2 行にまたがっていないか
        splitAcrossLines: [
          ...document.querySelectorAll(
            '[data-testid="next-match"] span.whitespace-nowrap, li[data-testid^="match-"] span.whitespace-nowrap'
          ),
        ]
          .filter((chunk) => chunk.getClientRects().length > 1)
          .map((chunk) => chunk.textContent),
      }));
      expect(measured.scrollWidth).toBe(measured.innerWidth);
      expect(measured.clipped).toEqual([]);
      expect(measured.splitAcrossLines).toEqual([]);
    });
  }
});

test('一番下の戻るボタンが、下のメニューに隠れない', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'さとう');
  await page.goto('/me');

  const button = page.getByRole('button', { name: '‹ 名前を選ぶ画面に戻る' });
  // 一番下までスクロールした状態で見る（Konsta の Page が動くので window ではなくボタン基準）
  await button.evaluate((el) => el.scrollIntoView({ block: 'end' }));

  const buttonBox = (await button.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  // 実際に測って比べる（見た目で「隠れていなさそう」と判断しない）
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(menuBox.y);
});
