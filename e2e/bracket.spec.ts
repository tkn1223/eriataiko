import { expect, test, type Page } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import {
  createBracketScenario,
  createFinishedFinalScenario,
  deleteBracketScenario,
  deleteFinishedFinalScenario,
  EMPTY_SLOT_LABELS,
  FINAL_WINNER_TEAM_NAME,
  HOKU_SEI_PAIR_NAMES,
  KO_BOX_TEST_IDS,
  TEAM_NAMES,
} from './helpers/bracket-scenario';

/**
 * /bracket（対戦表）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここでは本物のデータにつながっていることと、
 * スマホ幅での実際の見え方を確かめる。
 *
 * データは `e2e/helpers/bracket-scenario.ts` が、seed の予選 6 対戦・決勝 4 対戦に試合を足して作る
 * （足したものは終わったら消す）。星取表のマスの結果は、そのファイルの冒頭の表のとおり。
 */

const { nan, chuo, hoku, sei } = TEAM_NAMES;
/** 順位表の行の `data-testid` は `standing-row-<チーム番号>`。seed のチーム番号は 愛知南=1 … 愛知西=4。 */
const STANDING_ROW = { nan: 1, chuo: 2, hoku: 3, sei: 4 } as const;

test.beforeAll(async () => {
  await createBracketScenario();
});

test.afterAll(async () => {
  await deleteBracketScenario();
});

// 大会の画面は入場していないと入場画面へ送られる。中身を見たいので先に入っておく。
test.beforeEach(async ({ page }) => {
  await enterAsViewer(page);
});

/** 星取表のマス（行チームから見た対戦）。 */
function cell(page: Page, rowTeam: string, columnTeam: string) {
  return page.getByRole('button', { name: `${rowTeam} 対 ${columnTeam} の対戦` });
}

async function openTournamentTab(page: Page) {
  await page.getByRole('button', { name: '決勝トーナメント' }).click();
}

async function standingRowTestIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="standing-row-"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid') ?? ''));
}

test('「予選リーグ」「決勝トーナメント」の切り替えが出て、押すと中身が入れ替わる', async ({
  page,
}) => {
  await page.goto('/bracket');

  await expect(page.getByText('順位表（暫定）')).toBeVisible();

  await openTournamentTab(page);
  await expect(page.getByText('順位表（暫定）')).toHaveCount(0);
  await expect(page.getByText('準決勝', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '予選リーグ' }).click();
  await expect(page.getByText('順位表（暫定）')).toBeVisible();
});

test('予選リーグに本物のチーム名が出て、見本の名前は出ない。自分同士のマスは空', async ({
  page,
}) => {
  await page.goto('/bracket');

  await expect(cell(page, nan, chuo)).toBeVisible();
  await expect(cell(page, nan, nan)).toHaveCount(0);
  // 見本データにだけあった名前
  await expect(page.getByText('関東', { exact: true })).toHaveCount(0);
  await expect(page.getByText('関西', { exact: true })).toHaveCount(0);
});

test.describe('星取表のマス', () => {
  test('終わった対戦は、勝ちなら ○・負けなら ● と、行チームから見た勝ち試合数が出る', async ({
    page,
  }) => {
    await page.goto('/bracket');

    await expect(cell(page, hoku, sei)).toContainText('○');
    await expect(cell(page, hoku, sei)).toContainText('2-0');
    await expect(cell(page, sei, hoku)).toContainText('●');
    await expect(cell(page, sei, hoku)).toContainText('0-2');

    await expect(cell(page, sei, nan)).toContainText('○');
    await expect(cell(page, nan, sei)).toContainText('●');
    await expect(cell(page, nan, sei)).toContainText('0-2');
  });

  test('勝ち試合数が同じ終わった対戦は、△（引き分け）が出る', async ({ page }) => {
    await page.goto('/bracket');

    for (const [row, column] of [
      [nan, hoku],
      [hoku, nan],
    ]) {
      await expect(cell(page, row, column)).toContainText('△');
      await expect(cell(page, row, column)).toContainText('1-1');
      await expect(cell(page, row, column)).not.toContainText('○');
      await expect(cell(page, row, column)).not.toContainText('●');
    }
  });

  test('一部だけ終わった対戦は「試合中」と、終わった試合の勝ち数が出る', async ({ page }) => {
    await page.goto('/bracket');

    await expect(cell(page, chuo, sei)).toContainText('試合中');
    await expect(cell(page, chuo, sei)).toContainText('1-0');
  });

  test('試合が 1 つも始まっていない対戦は「未」が出て、数字は出ない', async ({ page }) => {
    await page.goto('/bracket');

    await expect(cell(page, chuo, hoku)).toContainText('未');
    await expect(cell(page, chuo, hoku)).not.toContainText(/\d-\d/);
  });

  test('星取表の下に「○＝カード勝利、△＝引き分け…」の注記が出る', async ({ page }) => {
    await page.goto('/bracket');

    await expect(
      page.getByText('○＝カード勝利、△＝引き分け（数字はカード内の勝ち試合数）。タップで詳細。')
    ).toBeVisible();
  });
});

test.describe('順位表', () => {
  test('終わった対戦だけで数えた勝敗が出る（引き分けがあるチームだけ「◯分」が付く）', async ({
    page,
  }) => {
    await page.goto('/bracket');

    // 愛知北: 西に 2-0 で勝ち、愛知南とは引き分け。愛知西: 北に負け、南に勝ち
    await expect(page.getByTestId(`standing-row-${STANDING_ROW.hoku}`)).toContainText('1勝0敗1分');
    await expect(page.getByTestId(`standing-row-${STANDING_ROW.sei}`)).toContainText('1勝1敗');
    await expect(page.getByTestId(`standing-row-${STANDING_ROW.sei}`)).not.toContainText('分');
  });

  test('勝ち数 → ゲーム → 得失点 の順に並ぶ（愛知北・愛知西が 1 勝で並び、ゲームの差で愛知北が上）', async ({
    page,
  }) => {
    await page.goto('/bracket');

    expect(await standingRowTestIds(page)).toEqual([
      `standing-row-${STANDING_ROW.hoku}`,
      `standing-row-${STANDING_ROW.sei}`,
      `standing-row-${STANDING_ROW.chuo}`,
      `standing-row-${STANDING_ROW.nan}`,
    ]);
  });

  test('順位表の下に「順位は 勝敗 → ゲーム → 得失点 の順で決定」が出る', async ({ page }) => {
    await page.goto('/bracket');

    await expect(page.getByText('順位表（暫定）')).toBeVisible();
    await expect(page.getByText('順位は 勝敗 → ゲーム → 得失点 の順で決定')).toBeVisible();
  });

  test('選手として入った人のチームの行だけが強調される', async ({ page }) => {
    // 愛知北のなかむら（#9）
    await enterAsPlayer(page, hoku, 'なかむら');
    await page.goto('/bracket');

    await expect(page.getByTestId(`standing-row-${STANDING_ROW.hoku}`)).toHaveClass(/bg-self-row/);
    for (const other of [STANDING_ROW.nan, STANDING_ROW.chuo, STANDING_ROW.sei]) {
      await expect(page.getByTestId(`standing-row-${other}`)).not.toHaveClass(/bg-self-row/);
    }
  });

  test('観戦者ではどの行も強調されない', async ({ page }) => {
    await page.goto('/bracket');

    for (const teamNumber of Object.values(STANDING_ROW)) {
      await expect(page.getByTestId(`standing-row-${teamNumber}`)).not.toHaveClass(/bg-self-row/);
    }
  });
});

test.describe('対戦の詳細', () => {
  test('マスを押すと詳細が下から出て、部・両ペアの名前・ゲーム数が並ぶ。「閉じる」で閉じる', async ({
    page,
  }) => {
    await page.goto('/bracket');

    await cell(page, hoku, sei).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(`予選リーグ：${hoku} 2-0 ${sei}`)).toBeVisible();
    await expect(sheet.getByText('1部')).toBeVisible();
    await expect(sheet.getByText('2部')).toBeVisible();
    // 名前は同じ 4 人が 2 試合に出ているので 2 行ずつ
    await expect(sheet.getByText(HOKU_SEI_PAIR_NAMES.hoku.join('・'))).toHaveCount(2);
    await expect(sheet.getByText(HOKU_SEI_PAIR_NAMES.sei.join('・'))).toHaveCount(2);
    await expect(sheet.getByText('1-0')).toHaveCount(2);

    await page.getByRole('button', { name: /閉じる/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('試合が 1 つも始まっていない対戦の詳細を開いても、見出しにスコアは出ない', async ({
    page,
  }) => {
    await page.goto('/bracket');

    await cell(page, chuo, hoku).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(`予選リーグ：${chuo} vs ${hoku}`)).toBeVisible();
    await expect(sheet.getByText('0-0')).toHaveCount(0);
  });
});

test.describe('決勝トーナメント', () => {
  test('本物の決勝の対戦が出る。チームが入っている枠はチーム名、空の枠は空枠の名前', async ({
    page,
  }) => {
    await page.goto('/bracket');
    await openTournamentTab(page);

    await expect(page.getByText('準決勝', { exact: true })).toBeVisible();
    await expect(page.getByText('決勝', { exact: true })).toBeVisible();
    await expect(page.getByText('優勝', { exact: true })).toBeVisible();
    await expect(page.getByText('3位決定戦')).toBeVisible();

    // チームが入っている準決勝2: 空枠の名前（予選2位など）が表に残っていても、チーム名のほうが出る
    const semifinal2 = page.getByTestId(KO_BOX_TEST_IDS.semifinal2);
    await expect(semifinal2.getByText(nan)).toBeVisible();
    await expect(semifinal2.getByText(hoku)).toBeVisible();
    await expect(semifinal2.getByText('予選2位')).toHaveCount(0);
    await expect(semifinal2.getByTestId('ko-team-dot')).toHaveCount(2);

    // 空の枠は表に入っている名前がそのまま出る
    for (const label of EMPTY_SLOT_LABELS) {
      await expect(page.getByText(label)).toBeVisible();
    }
    // 見本データにだけあった書き方（空白が入る）は出ない
    await expect(page.getByText('予選 1位')).toHaveCount(0);
  });

  test('対戦の状態と数字が、中の試合どおりに出る（試合中は LIVE と 1-0、まだの対戦は数字なし）', async ({
    page,
  }) => {
    await page.goto('/bracket');
    await openTournamentTab(page);

    const live = page.getByTestId(KO_BOX_TEST_IDS.semifinal2);
    await expect(live).toHaveAttribute('data-status', 'live');
    await expect(live.getByText('LIVE')).toBeVisible();
    await expect(live.getByTestId('ko-score-a')).toHaveText('1');
    await expect(live.getByTestId('ko-score-b')).toHaveText('0');

    const waiting = page.getByTestId(KO_BOX_TEST_IDS.thirdPlace);
    await expect(waiting).toHaveAttribute('data-status', 'waiting');
    await expect(waiting.getByTestId('ko-score-a')).toHaveCount(0);
  });

  test('予選リーグの試合が残っている間は「組み合わせは予選リーグ終了後に確定します」が出る', async ({
    page,
  }) => {
    await page.goto('/bracket');
    await openTournamentTab(page);

    await expect(page.getByText('組み合わせは予選リーグ終了後に確定します')).toBeVisible();
  });

  test('決勝が終わっていなければ「🏆 優勝」は出ない', async ({ page }) => {
    await page.goto('/bracket');
    await openTournamentTab(page);

    await expect(page.getByText(/🏆 優勝/)).toHaveCount(0);
    await expect(page.getByText('優勝未定')).toBeVisible();
  });
});

// 決勝の対戦が終わっているときの確認。ここだけ終わった決勝を作り、test ごとに消す。
test.describe('終わった決勝の対戦があるとき', () => {
  test.afterEach(async () => {
    await deleteFinishedFinalScenario();
  });

  test('決勝の対戦が終わっていても、予選の順位表の数字も並びも変わらない（#62）', async ({
    page,
  }) => {
    await page.goto('/bracket');
    const standingsBefore = await page.getByTestId('standings-scroll').innerText();
    const orderBefore = await standingRowTestIds(page);

    await createFinishedFinalScenario();
    await page.reload();

    // 決勝は本当に終わっていて、画面にも出ている（出ていなければ、この確認は何も確かめていない）
    await openTournamentTab(page);
    await expect(page.getByTestId(KO_BOX_TEST_IDS.final)).toHaveAttribute('data-status', 'done');
    await page.getByRole('button', { name: '予選リーグ' }).click();

    expect(await page.getByTestId('standings-scroll').innerText()).toBe(standingsBefore);
    expect(await standingRowTestIds(page)).toEqual(orderBefore);
    // 星取表のマスにも決勝の対戦は入らない（予選の 6 対戦 = 12 マスのまま）
    await expect(page.getByRole('button', { name: /の対戦$/ })).toHaveCount(12);
  });

  test('決勝の対戦が終わって勝ちが決まると「🏆 優勝：◯◯」が出る', async ({ page }) => {
    await createFinishedFinalScenario();
    await page.goto('/bracket');
    await openTournamentTab(page);

    await expect(page.getByText(`🏆 優勝：${FINAL_WINNER_TEAM_NAME}`)).toBeVisible();

    const finalBox = page.getByTestId(KO_BOX_TEST_IDS.final);
    await expect(finalBox).toHaveAttribute('data-status', 'done');
    await expect(finalBox.getByTestId('ko-score-a')).toHaveText('1');
    await expect(finalBox.getByTestId('ko-score-b')).toHaveText('0');
  });
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

    await openTournamentTab(page);
    const tournament = await measure();
    expect(tournament.scrollWidth).toBe(width);
  });

  test(`${width}px 幅で、星取表と順位表は枠からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');

    // 星取表は、はみ出す分をその中だけで横に動かす。枠そのものは画面の幅に収まる
    const matrixBox = (await page.getByTestId('league-matrix-scroll').boundingBox())!;
    expect(matrixBox.x + matrixBox.width).toBeLessThanOrEqual(width);

    // 順位表は引き分けの「◯分」が付いても、枠の中に収まる（横に動かない）
    const { scrollWidth, clientWidth } = await page
      .getByTestId('standings-scroll')
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBe(clientWidth);
  });

  test(`${width}px 幅で、星取表の注記（○・△の説明）が枠からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');

    const note = page.getByText('○＝カード勝利、△＝引き分け', { exact: false });
    await expect(note).toBeVisible();
    const box = (await note.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const { scrollWidth, clientWidth } = await note.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test(`${width}px 幅で、勝ち上がり表は枠の中だけで横に動き、ページ全体は動かない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');
    await openTournamentTab(page);

    const box = (await page.getByTestId('ko-bracket-scroll').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);

    const { scrollWidth, clientWidth } = await page
      .getByTestId('ko-bracket-scroll')
      .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    // 中身のほうが広い＝この枠の中でスクロールが起きる
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  // マイページで実際に文字が消えたことがあるので、幅と高さを実測して見張る
  test(`${width}px 幅で、詳細シートの文字が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/bracket');
    await cell(page, hoku, sei).click();

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

test('切り替え・マス・閉じるは、どれも高さ 44px 以上でタップできる', async ({ page }) => {
  await page.goto('/bracket');

  const tabBox = (await page.getByRole('button', { name: '予選リーグ' }).boundingBox())!;
  expect(tabBox.height).toBeGreaterThanOrEqual(44);

  const cellBox = (await cell(page, hoku, sei).boundingBox())!;
  expect(cellBox.height).toBeGreaterThanOrEqual(44);

  await cell(page, hoku, sei).click();
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

  await cell(page, hoku, sei).click();

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
  await cell(page, hoku, sei).click();
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
