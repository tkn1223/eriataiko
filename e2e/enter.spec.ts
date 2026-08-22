import { expect, test } from '@playwright/test';

/**
 * 入場画面の合言葉の入力欄。
 *
 * 伏せ字（type="password"）にすると、端末によっては日本語入力（IME）が切られて
 * 日本語の合言葉を打てなくなる。また autocomplete="one-time-code" は SMS の
 * 数字コード用の指定で、iPhone では数字キーパッドが出てしまう。
 * どちらも実際に「英数字しか入らない」という報告が出たので、ここで固定する。
 */
test.describe('入場画面の合言葉', () => {
  test('入力欄が伏せ字になっていない（日本語を打てるようにするため）', async ({ page }) => {
    await page.goto('/enter');
    const input = page.locator('input[placeholder="当日配布された合言葉"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'text');
  });

  test('SMS の確認コード扱いになっていない（数字キーパッドが出てしまう）', async ({ page }) => {
    await page.goto('/enter');
    const input = page.locator('input[placeholder="当日配布された合言葉"]');
    await expect(input).not.toHaveAttribute('autocomplete', 'one-time-code');
  });

  /**
   * このテストは**弱い**。Playwright は IME を通さず直接文字を流し込むので、
   * 「伏せ字だと日本語が打てない」を再現できない（伏せ字に戻してもここは通る）。
   * 本当に守っているのは上の 2 件。ここは「値がそのまま保持される」だけの確認。
   */
  test('日本語の合言葉を入れられて、入れた文字がそのまま見える', async ({ page }) => {
    await page.goto('/enter');
    const input = page.locator('input[placeholder="当日配布された合言葉"]');
    await input.fill('がんばれ2027');
    await expect(input).toHaveValue('がんばれ2027');
  });
});
