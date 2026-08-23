import { expect, test } from '@playwright/test';

/**
 * 入場画面。見た目は運用中のアプリ（badminton-app）に合わせてある。
 * 流れは「チームを選ぶ → 名前をタップ → 合言葉」。チーム分けの無い大会では
 * チームを選ぶ画面ごと出さない。見るだけの人は最初の画面の一番下から、
 * 合言葉なしで入れる。
 *
 * 合言葉の入力欄には触ってはいけない指定が 2 つある。
 * 伏せ字（type="password"）にすると、端末によっては日本語入力（IME）が切られて
 * 日本語の合言葉を打てなくなる。また autocomplete="one-time-code" は SMS の
 * 数字コード用の指定で、iPhone では数字キーパッドが出てしまう。
 * どちらも実際に「英数字しか入らない」という報告が出たので、ここで固定する。
 */

/** 手元の見本データ（supabase/seed.sql）の 1 チーム目と、そこに居る人。 */
const TEAM = '愛知南';
const PLAYER = 'さとう';

async function openPasscodeSheet(page: import('@playwright/test').Page) {
  await page.goto('/enter');
  await page.getByRole('button', { name: new RegExp(TEAM) }).click();
  await page.getByRole('button', { name: new RegExp(PLAYER) }).click();
  return page.getByPlaceholder('当日配布された合言葉');
}

test.describe('入場画面', () => {
  test('チームを選ぶと、そのチームの人が名前のボタンで並ぶ', async ({ page }) => {
    await page.goto('/enter');

    await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(TEAM) }).click();

    await expect(page.getByText('あなたの名前をタップ')).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(PLAYER) })).toBeVisible();
    // 部ごとにまとまっている
    await expect(page.getByText('1部', { exact: true })).toBeVisible();
  });

  test('「← 戻る」でチーム選びに戻れる', async ({ page }) => {
    await page.goto('/enter');
    await page.getByRole('button', { name: new RegExp(TEAM) }).click();
    await page.getByRole('button', { name: '← 戻る' }).click();

    await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
  });

  test('観戦の入口から、合言葉なしで見るだけの状態になれる', async ({ page }) => {
    await page.goto('/enter');
    await page.getByRole('button', { name: /観戦の方はこちら/ }).click();

    await expect(page.getByText('観戦中')).toBeVisible();
    await expect(page.getByRole('button', { name: '観戦をやめる' })).toBeVisible();
    // 合言葉は一度も聞かれない
    await expect(page.getByPlaceholder('当日配布された合言葉')).toHaveCount(0);

    // 元に戻しておく（テストは直列に流れるので、次のテストに持ち越さない）
    await page.getByRole('button', { name: '観戦をやめる' }).click();
    await expect(page.getByText('あなたのチームを選んでください')).toBeVisible();
  });

  test('名前を押すと合言葉の入力が開く', async ({ page }) => {
    const input = await openPasscodeSheet(page);
    await expect(input).toBeVisible();
  });

  test('入力欄が伏せ字になっていない（日本語を打てるようにするため）', async ({ page }) => {
    const input = await openPasscodeSheet(page);
    await expect(input).toHaveAttribute('type', 'text');
  });

  test('SMS の確認コード扱いになっていない（数字キーパッドが出てしまう）', async ({ page }) => {
    const input = await openPasscodeSheet(page);
    await expect(input).not.toHaveAttribute('autocomplete', 'one-time-code');
  });

  /**
   * このテストは**弱い**。Playwright は IME を通さず直接文字を流し込むので、
   * 「伏せ字だと日本語が打てない」を再現できない（伏せ字に戻してもここは通る）。
   * 本当に守っているのは上の 2 件。ここは「値がそのまま保持される」だけの確認。
   */
  test('日本語の合言葉を入れられて、入れた文字がそのまま見える', async ({ page }) => {
    const input = await openPasscodeSheet(page);
    await input.fill('がんばれ2027');
    await expect(input).toHaveValue('がんばれ2027');
  });

  test('合言葉が違うと、その場で理由が出る', async ({ page }) => {
    const input = await openPasscodeSheet(page);
    await input.fill('ちがう合言葉');
    await page.getByRole('button', { name: '入場する' }).click();

    // Next.js が画面遷移の読み上げ用に role="alert" の空要素を常に置いているので、
    // シートの中に絞って探す
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('合言葉が違います');
  });

  test('390px 幅で横にはみ出さない', async ({ page }) => {
    await page.goto('/enter');
    const overflowOnTeamStep = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowOnTeamStep).toBe(false);

    await page.getByRole('button', { name: new RegExp(TEAM) }).click();
    const overflowOnNameStep = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowOnNameStep).toBe(false);
  });
});
