import type { Page } from '@playwright/test';

/**
 * 観戦者として入場しておく。
 *
 * 大会の画面（`/courts` など）は、入場していないと入場画面へ送られる
 * （`src/app/(app)/layout.tsx`）。それぞれの画面テストで確かめたいのは
 * 中身の作りなので、入場そのものはここで済ませる。
 *
 * **画面を操作せず API を直に叩いている。** 入場画面の作りが変わっても
 * すべての画面テストが道連れで壊れないようにするため。
 * 入場画面そのものの確認は `e2e/enter.spec.ts` が受け持つ。
 */
export async function enterAsViewer(page: Page) {
  const response = await page.request.post('/api/session', { data: { as: 'viewer' } });
  if (!response.ok()) {
    throw new Error(`観戦者として入場できませんでした（${response.status()}）`);
  }
}
