import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { appScoreSyncStore } from '@/ui/courts/use-score-sync';

/**
 * サーバー側（`window` が無いところ）で、送れていない点の預かり場所に値が入らないこと。
 *
 * 預かり場所（`appScoreSyncStore`）はモジュールに 1 つなので、サーバーのプロセスでは
 * アクセスした全員で共有される。ここに値が入ると、ある人の未送信の点が別の人の画面に出る。
 * このファイルは `.test.ts`（node。`window` が無い）で動かし、サーバーと同じ条件で確かめる。
 * 描画で中身を混ぜないことは use-score-sync.test.tsx（renderToString）で確かめている。
 */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  appScoreSyncStore.dispose();
  vi.unstubAllGlobals();
});

test('サーバー側では window が無い（このテストの前提）', () => {
  expect(typeof window).toBe('undefined');
});

test('サーバー側で sync を呼んでも、何も預からず、送りもしない', () => {
  appScoreSyncStore.sync({ matchId: 'm', gameNumber: 1, sideAScore: 3, sideBScore: 1 });

  expect(appScoreSyncStore.getSnapshot()).toEqual({});
  expect(fetch).not.toHaveBeenCalled();
});
