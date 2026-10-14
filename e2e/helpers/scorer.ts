import { expect, type Locator, type Response } from '@playwright/test';

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
 *
 * 押したら、**入口が担当を受け付けた返事まで**待ってから返す。画面は返事を待たずに
 * 「入力をやめる」を出す（電波が悪くても入力を止めない、仕様 ⑤）ので、それだけを見て返すと、
 * 取る操作がまだ入口に届いていない。そのあとテストが裏で試合を終了にすると、遅れて届いた取る操作は
 * 「終了した試合です」と断られ、画面は担当を外して ＋ が消える（正しいふるまい）。開発サーバーが
 * 遅い CI で、押そうとした ＋ が消えて落ちた（実際に起きた）。
 */
export async function takeScorer(card: Locator) {
  const claim = card.getByRole('button', { name: '得点を入力する' }).first();
  const takeOver = card.getByRole('button', { name: '引き継ぐ' }).first();
  const stop = card.getByRole('button', { name: '入力をやめる' }).first();
  const page = card.page();

  // 画面が出そろうまで待つ（読み込み直後は、担当の欄がまだ描かれていないことがある）
  await expect(claim.or(takeOver).or(stop)).toBeVisible();

  // 押す前から待ち始める（押してから待つと、速い返事を取り逃がす）。断られて押し直したときは、
  // 押し直した分の返事で抜けるよう、受け付けられた返事だけを待つ
  let claimAccepted: Promise<Response> | null = null;
  function waitForClaimAccepted() {
    claimAccepted ??= page.waitForResponse(
      (response) =>
        /\/api\/matches\/[^/]+\/scorer$/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 15_000 }
    );
    // 押すところで落ちたときは待ちを最後まで見ないので、後から来る失敗を別のエラーとして出さない
    // （最後の await では、失敗はそのまま投げられる）
    claimAccepted.catch(() => {});
  }

  // 押そうとした瞬間に、ほかの端末（同じ人の別のブラウザ）の担当の知らせが届いて表示が入れ替わることがある。
  // そのときは押す相手が消えるので、見直してやり直す
  await expect(async () => {
    if (await stop.isVisible()) return;
    if (await claim.isVisible()) {
      waitForClaimAccepted();
      await claim.click({ timeout: 2000 });
    } else if (await takeOver.isVisible()) {
      waitForClaimAccepted();
      await takeOver.click({ timeout: 2000 });
      await page.getByRole('button', { name: 'OK' }).click({ timeout: 2000 });
    }
    await expect(stop).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  if (claimAccepted) await claimAccepted;
}
