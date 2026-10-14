import { expect, type Locator } from '@playwright/test';

/**
 * 結果LIVE のカードで「得点を入力する」を押して、この画面の人を担当にする
 * （docs/specs/2026-10-14-match-scorer.md）。
 *
 * ＋ − や「試合を終了する」は担当にだけ出るので、点を入れる前にこれを呼ぶ。
 * - もう自分が担当（「入力をやめる」が出ている）なら、何も押さない
 * - ほかの人が担当中なら、「引き継ぐ」→ 確認の「OK」まで押す
 * - 担当がいなければ「得点を入力する」を押す
 *
 * 担当を決める仕組みそのものを確かめるテストは、この部品を使わずに自分で押す。
 */
export async function takeScorer(card: Locator) {
  const claim = card.getByRole('button', { name: '得点を入力する' }).first();
  const takeOver = card.getByRole('button', { name: '引き継ぐ' }).first();
  const stop = card.getByRole('button', { name: '入力をやめる' }).first();
  const page = card.page();

  // 画面が出そろうまで待つ（読み込み直後は、担当の欄がまだ描かれていないことがある）
  await expect(claim.or(takeOver).or(stop)).toBeVisible();

  // 押そうとした瞬間に、ほかの端末（同じ人の別のブラウザ）の担当の知らせが届いて表示が入れ替わることがある。
  // そのときは押す相手が消えるので、見直してやり直す
  await expect(async () => {
    if (await stop.isVisible()) return;
    if (await claim.isVisible()) {
      await claim.click({ timeout: 2000 });
    } else if (await takeOver.isVisible()) {
      await takeOver.click({ timeout: 2000 });
      await page.getByRole('button', { name: 'OK' }).click({ timeout: 2000 });
    }
    await expect(stop).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}
