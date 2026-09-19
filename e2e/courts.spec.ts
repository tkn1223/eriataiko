import { expect, test } from '@playwright/test';
import { enterAsPlayer, enterAsViewer } from './helpers/enter';
import {
  BASE_LEAGUE_COMPLETED_MATCHES,
  BASE_LEAGUE_TOTAL_MATCHES,
  createCourtsBaseScenario,
  createFinalScenario,
  deleteCourtsBaseScenario,
  deleteFinalScenario,
  EMPTY_COURT_NUMBER,
  FINAL_COURT_NUMBER,
  FINAL_KNOCKOUT_COMPLETED_MATCHES,
  FINAL_KNOCKOUT_TOTAL_MATCHES,
  FINAL_TEAM_A_NAMES,
  LONG_NAME_COURT_NUMBER,
  LONG_TEAM_A_NAMES,
  LONG_TEAM_B_NAMES,
  SCORE_COURT_NUMBER,
  SCORE_TEAM_A_NAMES,
  SCORE_TEAM_B_NAMES,
  SLOT_LABEL_COURT_NUMBER,
  SLOT_LABEL_TEXT,
  SLOT_TEAM_A_NAMES,
  ZERO_SCORE_COURT_NUMBER,
} from './helpers/courts-scenario';

/**
 * /courts（結果LIVE）の画面確認。
 * *.test.tsx は jsdom で見た目の中身を、ここではスマホ幅での実際の見え方と、
 * 本物のデータ（supabase/seed.sql + e2e/helpers/courts-scenario.ts）につながっていることを確かめる。
 *
 * seed.sql のコート1（愛知南 対 愛知中央）はそのまま使う:
 * - 進行中（court_number=1, order_in_court=2）: 2部・予選 1回戦。
 *   たろう・いとう（愛知南、8点） 対 やまもと・まつもと（愛知中央、6点）
 * - 次（court_number=1, order_in_court=3）: 3部。さとう・いとう 対 わたなべ・まつもと
 *
 * それ以外の状態（0対0・相手未定・呼出待ち・決勝の同点・長い名前…）は
 * courts-scenario.ts が作る。作る前に必ず消してから作るので、後片付けが
 * 残っていても動く（e2e/helpers/long-name-player.ts と同じやり方）。
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

/**
 * 1 人ぶんの名前（「長谷川 一二三」など）が 2 行にまたがっていないかを実測する。
 *
 * ペア名は「五十嵐　十四郎・長谷川 一二三」のように 1 つの文字列で出すので、要素ごとに見る
 * chunksSplitAcrossLines では「ペアの途中（・のあと）で折り返した」のか「1 人の名前の
 * 途中で切れた」のかを見分けられない。前者は読めるが、後者は別の人に読めてしまう。
 * そこで文字列の中から 1 人ぶんの範囲を取り出し、その範囲の行の上端がいくつあるかで見る。
 */
async function personNamesSplitAcrossLines(
  scope: import('@playwright/test').Locator,
  personNames: string[]
) {
  return scope.evaluate((root, names) => {
    const split: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      for (const name of names) {
        let start = text.indexOf(name);
        while (start >= 0) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + name.length);
          const lineTops = new Set(
            Array.from(range.getClientRects(), (rect) => Math.round(rect.top))
          );
          if (lineTops.size > 1) split.push(name);
          start = text.indexOf(name, start + name.length);
        }
      }
    }
    return split;
  }, personNames);
}

test.beforeAll(createCourtsBaseScenario);
test.afterAll(deleteCourtsBaseScenario);

test('本物の試合が出る。見本の名前（佐々木・井上など）は出ない', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('2部')).toBeVisible();
  await expect(card.getByText('予選 1回戦')).toBeVisible();
  await expect(card.getByText('たろう・いとう')).toBeVisible();
  await expect(card.getByText('やまもと・まつもと')).toBeVisible();

  await expect(page.getByText('佐々木・井上')).toHaveCount(0);
});

test('コートのカードが8枚出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
    await expect(courtCard(page, courtNumber)).toBeVisible();
  }
});

test('進行中のコートにLIVEと部・回戦・両ペアの名前が出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('LIVE')).toBeVisible();
  await expect(card.getByText('2部')).toBeVisible();
  await expect(card.getByText('予選 1回戦')).toBeVisible();
});

test('枠の数がmax_game_countどおりで、保存済みの得点が枠に入っている', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  const card = courtCard(page, 1);
  await expect(card.getByText('第1ゲーム')).toBeVisible();
  await expect(card.getByText('第2ゲーム')).toHaveCount(0);
  await expect(card.getByText('8', { exact: true })).toBeVisible();
  await expect(card.getByText('6', { exact: true })).toBeVisible();
});

test('次の試合（部・ペア名）が出る。次が無ければ出ない', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  await expect(courtCard(page, 1).getByText('次')).toBeVisible();
  await expect(courtCard(page, 1).getByText('さとう・いとう vs わたなべ・まつもと')).toBeVisible();

  // コート2（courts-scenario の得点シナリオ）は進行中はあるが次は無い
  await expect(courtCard(page, SCORE_COURT_NUMBER).getByText('次')).toHaveCount(0);
});

test('進行中が無く次があるコートには「呼出待ち」が出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  const card = courtCard(page, SLOT_LABEL_COURT_NUMBER);
  await expect(card.getByText('呼出待ち')).toBeVisible();
  await expect(card.getByText('LIVE')).toHaveCount(0);
});

test('相手がまだ決まっていない対戦は、名前の代わりに空枠ラベルが出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  const card = courtCard(page, SLOT_LABEL_COURT_NUMBER);
  await expect(
    card.getByText(`${SLOT_TEAM_A_NAMES.join('・')} vs ${SLOT_LABEL_TEXT}`)
  ).toBeVisible();
});

test('進行中も次も無いコートには「予定なし」が出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  await expect(courtCard(page, EMPTY_COURT_NUMBER).getByText('予定なし')).toBeVisible();
});

test('「予選リーグ」のラベルと、いまの段の試合消化数が出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  await expect(page.getByText('予選リーグ')).toBeVisible();
  await expect(
    page.getByText(`${BASE_LEAGUE_COMPLETED_MATCHES}/${BASE_LEAGUE_TOTAL_MATCHES} 試合消化`)
  ).toBeVisible();
});

test('「まだ保存されません」の帯が出る', async ({ page }) => {
  await enterAsViewer(page);
  await page.goto('/courts');

  await expect(
    page.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
  ).toBeVisible();
});

test.describe('あなたの試合', () => {
  test('選手として入った人が出る進行中の試合に「あなたの試合」が出る', async ({ page }) => {
    // 愛知南のたろう（#3）は seed のコート1 進行中の試合（たろう・いとう 対 やまもと・まつもと）に出ている
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    await expect(courtCard(page, 1).getByText('あなたの試合')).toBeVisible();
  });

  test('選手として入った人が出る次の試合の名前もaccent色で強調される', async ({ page }) => {
    // 愛知南のさとう（#1）は seed のコート1 次の試合（さとう・いとう 対 わたなべ・まつもと）に出ている
    await enterAsPlayer(page, '愛知南', 'さとう');
    await page.goto('/courts');

    await expect(courtCard(page, 1).getByText('さとう・いとう vs わたなべ・まつもと')).toHaveClass(
      /text-accent/
    );
  });

  test('観戦者には「あなたの試合」が出ない', async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/courts');

    await expect(page.getByText('あなたの試合')).toHaveCount(0);
  });
});

test.describe('観戦者', () => {
  test('「−」「＋」「試合を終了する」が出ない', async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/courts');

    await expect(page.getByRole('button', { name: /得点を1増やす/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /得点を1減らす/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);
  });

  test('得点は数字で見える', async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/courts');

    const card = courtCard(page, 1);
    await expect(card.getByText('8', { exact: true })).toBeVisible();
    await expect(card.getByText('6', { exact: true })).toBeVisible();
  });
});

test.describe('選手として入った人の操作', () => {
  test('「＋」を押すと得点が1増え、「−」で1減る。0より下にはならない', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, SCORE_COURT_NUMBER);
    const teamAName = SCORE_TEAM_A_NAMES.join('・');
    const teamBName = SCORE_TEAM_B_NAMES.join('・');

    await expect(card.getByText('2', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: `${teamBName}の第1ゲームの得点を1増やす` }).click();
    await expect(card.getByText('1', { exact: true })).toBeVisible();

    const minus = card.getByRole('button', { name: `${teamAName}の第1ゲームの得点を1減らす` });
    for (let i = 0; i < 5; i += 1) {
      await minus.click();
    }
    await expect(card.getByText('0', { exact: true })).toBeVisible();
  });

  test('0対0のコートで「試合を終了する」を押すと「まだ点が入っていません」と出て、確認画面は出ない', async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, ZERO_SCORE_COURT_NUMBER);
    await card.getByRole('button', { name: '試合を終了する' }).click();

    await expect(card.getByText('まだ点が入っていません')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('「試合を終了する」→確認画面の「OK」で試合が終了する', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, SCORE_COURT_NUMBER);
    await card.getByRole('button', { name: '試合を終了する' }).click();
    await expect(page.getByText('この試合を終了します')).toBeVisible();

    await page.getByRole('button', { name: 'OK' }).click();

    await expect(card.getByText('終了')).toBeVisible();
    await expect(card.getByText('LIVE')).toHaveCount(0);
    await expect(card.getByRole('button', { name: '試合を終了する' })).toHaveCount(0);
    await expect(card.getByText('第1ゲーム 2-0')).toBeVisible();
    await expect(card.getByText(/勝ち/)).toBeVisible();
    await expect(card.getByText(/1-0/)).toBeVisible();
  });

  test('確認画面の「戻る」を押すと何も変わらずに閉じる', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, SCORE_COURT_NUMBER);
    await card.getByRole('button', { name: '試合を終了する' }).click();
    await page.getByRole('button', { name: '戻る' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(card.getByText('LIVE')).toBeVisible();
  });

  test('確認画面は背景タップでもEscでも閉じる', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, SCORE_COURT_NUMBER);

    await card.getByRole('button', { name: '試合を終了する' }).click();
    await page.getByRole('button', { name: '背景' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await card.getByRole('button', { name: '試合を終了する' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('「＋」を速く連打しても押した回数どおりに増える', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, SCORE_COURT_NUMBER);
    const plus = card.getByRole('button', {
      name: `${SCORE_TEAM_B_NAMES.join('・')}の第1ゲームの得点を1増やす`,
    });
    await plus.scrollIntoViewIfNeeded();

    const box = (await plus.boundingBox())!;
    for (let i = 0; i < 10; i += 1) {
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    // 村上・福田（B）は0点から始まる
    await expect(card.getByText('10', { exact: true })).toBeVisible();
  });
});

test('押せるところ（−・＋・試合を終了する）はどれも44px以上', async ({ page }) => {
  await enterAsPlayer(page, '愛知南', 'たろう');
  await page.goto('/courts');

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
  await enterAsPlayer(page, '愛知南', 'たろう');
  await page.goto('/courts');

  await courtCard(page, SCORE_COURT_NUMBER).getByRole('button', { name: '試合を終了する' }).click();

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
  await enterAsViewer(page);
  await page.goto('/courts');

  const lastCard = courtCard(page, 8);
  await lastCard.scrollIntoViewIfNeeded();

  const cardBox = (await lastCard.boundingBox())!;
  const menuBox = (await page.getByRole('navigation', { name: 'メインメニュー' }).boundingBox())!;

  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(menuBox.y);
});

// 手元に多いのは 390px（iPhone 12 以降）だが、375px（iPhone SE / 8）もまだ使われている
for (const width of [375, 390]) {
  test(`${width}px 幅で、ページ全体が横にはみ出さない`, async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(innerWidth).toBe(width);
    expect(scrollWidth).toBe(innerWidth);
  });

  test(`${width}px 幅で、空白入りの長い名前でもカードからはみ出さず、1 人の名前が途中で切れない`, async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    const card = courtCard(page, LONG_NAME_COURT_NUMBER);
    // 進行中（両ペア）と「次」の行の両方に、同じ長い名前が出ている前提を先に確かめる
    await expect(card.getByText(LONG_TEAM_A_NAMES.join('・'), { exact: true })).toBeVisible();
    await expect(
      card.getByText(`${LONG_TEAM_A_NAMES.join('・')} vs ${LONG_TEAM_B_NAMES.join('・')}`)
    ).toBeVisible();

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

    expect(
      await personNamesSplitAcrossLines(card, [...LONG_TEAM_A_NAMES, ...LONG_TEAM_B_NAMES])
    ).toEqual([]);

    // 2 桁の得点が枠（w-7）からはみ出さない
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
        .filter((box) => box.textWidth > box.boxWidth)
    );
    expect(tooNarrow).toEqual([]);
  });

  test(`${width}px 幅で、ペア名が途中で切れない`, async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/courts');

    const splitAcrossLines = await chunksSplitAcrossLines(
      page.locator('[data-testid^="court-card-"] span')
    );
    expect(splitAcrossLines).toEqual([]);
  });
}

/**
 * 決勝トーナメントの試合を 1 つ start すると「いまの段」が切り替わる
 * （docs/specs/2026-09-19-courts-real-data.md の「決めたこと」2）。
 *
 * 基本シナリオ（予選リーグだけ）とは別に、この describe の中だけで作って消す。
 * ここで作った試合が生きている間だけ、ファイル全体の「予選リーグ」ラベルが
 * 「決勝トーナメント」に変わってしまうため。
 */
test.describe('決勝トーナメントが始まったとき', () => {
  test.beforeAll(createFinalScenario);
  test.afterAll(deleteFinalScenario);

  test('ラベルと試合消化数が「決勝トーナメント」に切り替わる', async ({ page }) => {
    await enterAsViewer(page);
    await page.goto('/courts');

    // 「決勝トーナメント 準決勝」（回戦名）も同じ文字列を含むので、段の見出しは完全一致で見る
    await expect(page.getByText('決勝トーナメント', { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${FINAL_KNOCKOUT_COMPLETED_MATCHES}/${FINAL_KNOCKOUT_TOTAL_MATCHES} 試合消化`)
    ).toBeVisible();
  });

  test('上限ゲーム数ぶんの枠が「第Nゲーム」として並ぶ', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, FINAL_COURT_NUMBER);
    await expect(card.getByText('第1ゲーム')).toBeVisible();
    await expect(card.getByText('第2ゲーム')).toBeVisible();
    await expect(card.getByText('第3ゲーム')).toBeVisible();
  });

  test('同点（勝ちゲーム数が同数）のコートで「試合を終了する」を押すと「同点では終了できません」と出る', async ({
    page,
  }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, FINAL_COURT_NUMBER);
    await card.getByRole('button', { name: '試合を終了する' }).click();

    await expect(card.getByText('同点では終了できません')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('同点を解消してから押すと、確認画面が出て、OKで試合が終了する', async ({ page }) => {
    await enterAsPlayer(page, '愛知南', 'たろう');
    await page.goto('/courts');

    const card = courtCard(page, FINAL_COURT_NUMBER);
    const teamAName = FINAL_TEAM_A_NAMES.join('・');

    await card.getByRole('button', { name: `${teamAName}の第3ゲームの得点を1増やす` }).click();
    await expect(card.getByText('同点では終了できません')).toHaveCount(0);

    await card.getByRole('button', { name: '試合を終了する' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/2-1/)).toBeVisible();

    await page.getByRole('button', { name: 'OK' }).click();
    await expect(card.getByText('終了')).toBeVisible();
    await expect(card.getByText('第3ゲーム 1-0')).toBeVisible();
  });

  for (const width of [375, 390]) {
    test(`${width}px 幅で、決勝（枠3つ）の2桁の得点が枠に収まり、カードからはみ出さない`, async ({
      page,
    }) => {
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/courts');

      const card = courtCard(page, FINAL_COURT_NUMBER);

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
          .filter((box) => box.textWidth > box.boxWidth)
      );
      expect(tooNarrow).toEqual([]);

      const stickingOut = await card.evaluate((element) => {
        const cardRect = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('*'))
          .map((child) => ({ text: child.textContent, rect: child.getBoundingClientRect() }))
          .filter(
            ({ rect }) =>
              rect.width > 0 &&
              (rect.right > cardRect.right + 0.5 || rect.left < cardRect.left - 0.5)
          )
          .map(({ text }) => text);
      });
      expect(stickingOut).toEqual([]);
    });

    test(`${width}px 幅で、確認画面の文字が途中で切れない`, async ({ page }) => {
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/courts');

      // 長い名字どうし（長谷川・五十嵐 / 小早川・日下部）で、同点を解消してから開く、
      // いちばん詰まった確認画面を実測する。
      const card = courtCard(page, FINAL_COURT_NUMBER);
      const teamAName = FINAL_TEAM_A_NAMES.join('・');
      await card.getByRole('button', { name: `${teamAName}の第3ゲームの得点を1増やす` }).click();
      await card.getByRole('button', { name: '試合を終了する' }).click();

      const splitAcrossLines = await chunksSplitAcrossLines(
        page.getByRole('dialog').locator('span, h2')
      );
      expect(splitAcrossLines).toEqual([]);
    });

    test(`${width}px 幅で、終了したコートの見た目が横にはみ出さない`, async ({ page }) => {
      await enterAsPlayer(page, '愛知南', 'たろう');
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/courts');

      const card = courtCard(page, FINAL_COURT_NUMBER);
      const teamAName = FINAL_TEAM_A_NAMES.join('・');
      await card.getByRole('button', { name: `${teamAName}の第3ゲームの得点を1増やす` }).click();
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
  }
});
