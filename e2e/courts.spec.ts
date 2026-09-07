import { expect, test } from '@playwright/test';
import { enterAsViewer } from './helpers/enter';

/**
 * /courts（結果LIVE）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方を確かめる。
 *
 * 見本データ（src/ui/courts/sample-data.ts）はこの仕様書に合わせて作ってある:
 * コート1・2・4 は予選（上限1ゲーム）で得点入り、コート3 は予選で0対0、
 * コート5 は決勝（上限3ゲーム）で2ゲーム目まで入り、コート6 は決勝で1-1の同点。
 */

function courtCard(page: import('@playwright/test').Page, courtNumber: number) {
  return page.getByTestId(`court-card-${courtNumber}`);
}

/**
 * 折り返さない塊（whitespace-nowrap の span など）が 2 行にまたがっていないかを実測する。
 * 行が変わったかは矩形の上端で見る。矩形の「数」で見ると、React が
 * 「9 - 7」のような文字列を細かい text ノードに分けたときに 1 行でも複数になり、
 * 崩れていないのに崩れたと言ってくる（実際に誤検知した）。
 */
async function chunksSplitAcrossLines(chunks: import('@playwright/test').Locator) {
  return chunks.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const lineTops = new Set(
          Array.from(element.getClientRects(), (rect) => Math.round(rect.top))
        );
        return lineTops.size > 1;
      })
      .map((element) => element.textContent)
  );
}

// 大会の画面は入場していないと入場画面へ送られる。中身を見たいので先に入っておく。
test.beforeEach(async ({ page }) => {
  await enterAsViewer(page);
});

test('「予選リーグ」のラベルと「2/48 試合消化」が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(page.getByText('予選リーグ')).toBeVisible();
  await expect(page.getByText('2/48 試合消化')).toBeVisible();
});

test('コートのカードが8枚出る', async ({ page }) => {
  await page.goto('/courts');

  for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
    await expect(courtCard(page, courtNumber)).toBeVisible();
  }
});

test('進行中のコートに「LIVE」と部・回戦が出る', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('LIVE')).toBeVisible();
  await expect(card.getByText('1部')).toBeVisible();
  await expect(card.getByText('予選 1回戦')).toBeVisible();
});

test('上限ゲーム数ぶんの枠が「第Nゲーム」として並ぶ', async ({ page }) => {
  await page.goto('/courts');

  // コート5 は決勝（上限3ゲーム）
  const card = courtCard(page, 5);
  await expect(card.getByText('第1ゲーム')).toBeVisible();
  await expect(card.getByText('第2ゲーム')).toBeVisible();
  await expect(card.getByText('第3ゲーム')).toBeVisible();
});

test('各ゲームの枠にペア名の色・−・＋・得点が出て、押せる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('佐々木・井上')).toBeVisible();
  await expect(card.getByText('田中・木村')).toBeVisible();
  await expect(
    card.getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1減らす' })
  ).toBeVisible();
  await expect(card.getByText('20', { exact: true })).toBeVisible();
  await expect(card.getByText('19', { exact: true })).toBeVisible();
});

test('まだ点が入っていない枠も押せる', async ({ page }) => {
  await page.goto('/courts');

  // コート5 は決勝（上限3ゲーム）。第3ゲームはまだ0対0
  const card = courtCard(page, 5);
  await card.getByRole('button', { name: '石川・前田の第3ゲームの得点を1増やす' }).click();

  // 第3ゲームの枠に限って1になっている（他の枠は変わらない）
  await expect(card.getByText('1', { exact: true })).toBeVisible();
});

test('「＋」を押すと得点が1増え、「−」で1減る。0より下にはならない', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 4);
  // コート4 は 加藤・斎藤（B）5点から始まる
  await expect(card.getByText('5', { exact: true })).toBeVisible();

  await card.getByRole('button', { name: '加藤・斎藤の第1ゲームの得点を1増やす' }).click();
  await expect(card.getByText('6', { exact: true })).toBeVisible();

  const minus = card.getByRole('button', { name: '加藤・斎藤の第1ゲームの得点を1減らす' });
  for (let i = 0; i < 10; i += 1) {
    await minus.click();
  }
  await expect(card.getByText('0', { exact: true })).toBeVisible();
});

test('空いているコートに「呼出待ち」または「予定なし」が状態どおりに出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 7).getByText('呼出待ち')).toBeVisible();
  await expect(courtCard(page, 8).getByText('予定なし')).toBeVisible();
});

test('各コートに「次」の試合が出る。次が無いコートには出ない', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 1).getByText('次')).toBeVisible();
  await expect(courtCard(page, 1).getByText('川口・浜田 vs 小林・西村')).toBeVisible();

  // コート3 は進行中だが、次の試合は無い
  await expect(courtCard(page, 3).getByText('次')).toHaveCount(0);
});

test('自分の試合中のコートに「あなたの試合」の印が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(courtCard(page, 3).getByText('あなたの試合')).toBeVisible();
});

test('「まだ保存されません」の帯が出る', async ({ page }) => {
  await page.goto('/courts');

  await expect(
    page.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
  ).toBeVisible();
});

test('0対0のコートで「試合を終了する」を押すと「まだ点が入っていません」と出て、確認画面は出ない', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート3 は 0対0 のまま始まる
  const card = courtCard(page, 3);
  await card.getByRole('button', { name: '試合を終了する' }).click();

  await expect(card.getByText('まだ点が入っていません')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('同点（勝ちゲーム数が同数）のコートで「試合を終了する」を押すと「同点では終了できません」と出て、確認画面は出ない', async ({
  page,
}) => {
  await page.goto('/courts');

  // コート6 は決勝（上限3ゲーム）。1-1 の同点。
  const card = courtCard(page, 6);
  await card.getByRole('button', { name: '試合を終了する' }).click();

  await expect(card.getByText('同点では終了できません')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('同点を解消してから押すと、確認画面が出る', async ({ page }) => {
  await page.goto('/courts');

  // コート6 は 1-1 の同点。第3ゲームに1点入れて 2-1 にする
  const card = courtCard(page, 6);
  await card.getByRole('button', { name: '試合を終了する' }).click();
  await expect(card.getByText('同点では終了できません')).toBeVisible();

  // 点を入れ直した時点で案内は消える。残ると「まだ押せない」と誤解させる
  await card.getByRole('button', { name: '長谷川・五十嵐の第3ゲームの得点を1増やす' }).click();
  await expect(card.getByText('同点では終了できません')).toHaveCount(0);

  await card.getByRole('button', { name: '試合を終了する' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('この試合を終了します')).toBeVisible();
  await expect(card.getByText('同点では終了できません')).toHaveCount(0);
});

test('「試合を終了する」を押すと確認画面が出て、まだ画面は変わらない', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('この試合を終了します')).toBeVisible();
  // まだ確定していないので、カードの得点はそのまま
  await expect(card.getByText('20', { exact: true })).toBeVisible();
  await expect(card.getByText('19', { exact: true })).toBeVisible();
});

test('確認画面に、各ゲームの得点と勝ったペアが出る', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();

  await expect(page.getByText('20 - 19', { exact: false })).toBeVisible();
  await expect(page.getByText('勝ち: 佐々木・井上', { exact: true })).toBeVisible();
});

test('確認画面の「戻る」を押すと何も変わらずに閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();
  await page.getByRole('button', { name: '戻る' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByText('LIVE')).toBeVisible();
});

test('確認画面は背景タップでも閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();
  await page.getByRole('button', { name: '背景' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('確認画面はEscでも閉じる', async ({ page }) => {
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('予選（上限1ゲーム）は、確認画面の「OK」で試合終了になる', async ({ page }) => {
  await page.goto('/courts');

  // コート1 は予選（上限1ゲーム）。佐々木・井上（A）20点 対 田中・木村（B）19点
  const card = courtCard(page, 1);
  await card.getByRole('button', { name: '試合を終了する' }).click();
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(card.getByText('終了')).toBeVisible();
  await expect(card.getByText('LIVE')).toHaveCount(0);
  await expect(card.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);
  await expect(card.getByText('第1ゲーム 20-19')).toBeVisible();
  await expect(card.getByText('勝ち:', { exact: false })).toBeVisible();
  await expect(card.getByText('1-0', { exact: false })).toBeVisible();
  // 「次」の試合はそのまま出る
  await expect(card.getByText('次')).toBeVisible();
});

test('決勝（上限3ゲーム）は、2ゲーム先取で試合終了になる', async ({ page }) => {
  await page.goto('/courts');

  // コート5 は決勝。第1ゲーム 21-19 を A（石川・前田）が取り、第2ゲームは 5-8。
  // A に4点足して 9-8 にすれば、この第2ゲームでも A が勝ち2-0になる。
  const card = courtCard(page, 5);
  const plus = card.getByRole('button', { name: '石川・前田の第2ゲームの得点を1増やす' });
  for (let i = 0; i < 4; i += 1) {
    await plus.click();
  }

  await card.getByRole('button', { name: '試合を終了する' }).click();
  await expect(page.getByText('この試合を終了します')).toBeVisible();
  await expect(page.getByText(/2-0/)).toBeVisible();

  await page.getByRole('button', { name: 'OK' }).click();

  await expect(card.getByText('終了')).toBeVisible();
  await expect(card.getByText('第2ゲーム 9-8')).toBeVisible();
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

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.locator('[data-testid^="court-card-"] span')
    );
    expect(splitAcrossLines).toEqual([]);
  });

  test(`${width}px 幅で、確認画面の文字が途中で切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // コート6 は決勝。長い名字どうし（長谷川・五十嵐 / 小早川・日下部）で、
    // 同点を解消してから開く、いちばん詰まった確認画面を実測する。
    const card = courtCard(page, 6);
    await card.getByRole('button', { name: '長谷川・五十嵐の第3ゲームの得点を1増やす' }).click();
    await card.getByRole('button', { name: '試合を終了する' }).click();

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.getByRole('dialog').locator('span, h2')
    );
    expect(splitAcrossLines).toEqual([]);
  });

  test(`${width}px 幅で、終了したコートの見た目が横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // 終了したコートは「勝ち: 長谷川・五十嵐（2-1）」まで出る。ここも実際に終わらせて測る。
    const card = courtCard(page, 6);
    await card.getByRole('button', { name: '長谷川・五十嵐の第3ゲームの得点を1増やす' }).click();
    await card.getByRole('button', { name: '試合を終了する' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(card.getByText('終了', { exact: true })).toBeVisible();

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.locator('[data-testid^="court-card-"] span')
    );
    expect(splitAcrossLines).toEqual([]);

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBe(innerWidth);
  });

  test(`${width}px 幅で、決勝（枠3つ）の2桁の得点が枠に収まり、カードからはみ出さない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    // コート5 は決勝（上限3ゲーム）。枠が 3 つ並ぶうえ 21-19 と 2 桁が入る、いちばん詰まった形。
    const card = courtCard(page, 5);

    const tooNarrow = await card.locator('span.tabular').evaluateAll((boxes) =>
      boxes
        .map((box) => {
          const range = document.createRange();
          range.selectNodeContents(box);
          return {
            text: box.textContent,
            textWidth: range.getBoundingClientRect().width,
            boxWidth: box.getBoundingClientRect().width,
          };
        })
        // 数字が枠より広いと、両どなりの「−」「＋」に食い込んで読みにくくなる
        .filter((box) => box.textWidth > box.boxWidth)
    );
    expect(tooNarrow).toEqual([]);

    const stickingOut = await card.evaluate((element) => {
      const cardRect = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll('*'))
        .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
        .filter(
          ({ rect }) =>
            rect.width > 0 && (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5)
        )
        .map(({ text }) => text);
    });
    expect(stickingOut).toEqual([]);
  });
}

test('押せるところ（−・＋・試合を終了する）はどれも44px以上', async ({ page }) => {
  await page.goto('/courts');

  // 1 つだけ測っても他のコートが小さいままなら意味が無いので、全カードのボタンを測る
  const tooSmall = await page
    .locator('[data-testid^="court-card-"] button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const { width, height } = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label') ?? button.textContent, width, height };
        })
        .filter((box) => box.height < 44 || box.width < 44)
    );

  expect(tooSmall).toEqual([]);
});

test('確認画面の「OK」「戻る」はどちらも44px以上', async ({ page }) => {
  await page.goto('/courts');

  await courtCard(page, 1).getByRole('button', { name: '試合を終了する' }).click();

  const tooSmall = await page
    .getByRole('dialog')
    .locator('button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const { width, height } = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label') ?? button.textContent, width, height };
        })
        .filter((box) => box.height < 44 || box.width < 44)
    );

  expect(tooSmall).toEqual([]);
});

test('一番下のコートのカードが下のメニューに隠れない', async ({ page }) => {
  await page.goto('/courts');

  const lastCard = courtCard(page, 8);
  await lastCard.scrollIntoViewIfNeeded();

  // 8 面ぶん縦に並ぶので、最後のカードが貼り付いたメニューの裏に入らないかを実測する
  const cardBox = (await lastCard.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(menuBox.y);
});

test('「＋」を速く連打しても押した回数どおりに増える', async ({ page }) => {
  await page.goto('/courts');

  // 得点係は 1 点ごとに間を空けて押してくれない。押しそこねると試合が止まる。
  const card = courtCard(page, 4);
  const plus = card.getByRole('button', { name: '加藤・斎藤の第1ゲームの得点を1増やす' });
  await plus.scrollIntoViewIfNeeded();

  const box = (await plus.boundingBox())!;
  for (let i = 0; i < 10; i += 1) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  // コート4 は 加藤・斎藤（B）5点から始まる
  await expect(card.getByText('15', { exact: true })).toBeVisible();
});
