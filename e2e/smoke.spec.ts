import { expect, test } from '@playwright/test';
import { enterAsViewer } from './helpers/enter';

/**
 * 土台が壊れていないことを確かめる最小のテスト。
 * 新しい画面を作ったら e2e/<画面名>.spec.ts を足していく。
 */

// 大会の画面は入場していないと入場画面へ送られる。中身を見たいので先に入っておく。
test.beforeEach(async ({ page }) => {
  await enterAsViewer(page);
});

test('トップを開くと「試合速報」に飛ぶ', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/courts$/);
  // メニューと URL が対応していることの確認でもある
  await expect(page.getByRole('link', { name: /試合速報/ })).toHaveAttribute('href', '/courts');
});

test('ヘッダーと下のメニューが出る', async ({ page }) => {
  await page.goto('/');
  // ヘッダーの大会名は表（competitions.name）から読む。決め打ちの控えの文字
  // （src/config/tournament.ts）が出ていたら、表につながっていないということ。
  await expect(page.getByRole('heading', { name: 'えりあ太鼓カップ 2027' })).toBeVisible();
  await expect(page.getByRole('link', { name: /試合速報/ })).toBeVisible();
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
  const linkBox = (await page.getByRole('link', { name: /試合速報/ }).boundingBox())!;
  expect(linkBox.height).toBeGreaterThanOrEqual(44);
});

test('スクロールしてもメニューは消えない', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => window.scrollBy(0, 500));
  await expect(page.getByRole('link', { name: /試合速報/ })).toBeInViewport();
});

test('メニューを押すと画面が切り替わる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /対戦表/ }).click();
  await expect(page).toHaveURL(/\/bracket$/);
  // 対戦表は e2e/bracket.spec.ts で詳しく見るので、ここでは切り替わったことだけ確認する。
  // 本文の大きな「対戦表」の見出しは #92 でやめた（画面の名前は上の帯に出す）ので、星取表の見出しで見る
  await expect(page.getByRole('heading', { name: '星取表' })).toBeVisible();
});

test('上の帯は 60px（副題がある 2 行のとき）で、大会名と副題は帯の左右の真ん中にそろう', async ({
  page,
}) => {
  // 試合速報は大会名の下に副題（予選リーグ ◯/◯ 試合）が出るので、2 行ある状態で測る
  await page.goto('/courts');
  const bar = page.getByRole('banner');
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toBeVisible();

  const barBox = (await bar.boundingBox())!;
  // 上下の帯をどちらも 60px にそろえる（2026-11-26 yosuke さん）
  expect(Math.round(barBox.height)).toBe(60);

  // 文字そのものの幅で測る（h1 の箱は行いっぱいに広がることがあるので Range で文字の範囲を取る）
  const centers = await bar.evaluate((barElement) => {
    const textCenter = (element: Element | null) => {
      if (!element) return null;
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    const barRect = barElement.getBoundingClientRect();
    const title = barElement.querySelector('h1');
    return {
      bar: barRect.left + barRect.width / 2,
      title: textCenter(title),
      subtitle: textCenter(title?.nextElementSibling ?? null),
    };
  });
  // シャトルは文字のすぐ左に付くので、文字のかたまりはその分だけ右にずれる（シャトルの幅の半分 ＋ 間）
  for (const center of [centers.title, centers.subtitle]) {
    expect(center).not.toBeNull();
    expect(Math.abs(center! - centers.bar)).toBeLessThanOrEqual(30);
  }
  // 大会名と副題は、互いに真ん中がそろう
  expect(Math.abs(centers.title! - centers.subtitle!)).toBeLessThanOrEqual(1);
});

test('下のメニューは 60px（上の帯と同じ）。押せる高さは 1 項目 44px 以上のまま、文字は上の帯と同じ明朝', async ({
  page,
}) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'メインメニュー' });
  const menuBox = (await menu.boundingBox())!;
  expect(Math.round(menuBox.height)).toBe(60);

  const link = page.getByRole('link', { name: /試合速報/ });
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // 字体は上の帯の大会名と同じ指定（端末によって実際の字は変わるので、指定どうしを比べる）
  const titleFont = await page
    .getByRole('heading', { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  const menuFont = await link.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(menuFont).toBe(titleFont);
  expect(menuFont).toContain('Mincho');
});
