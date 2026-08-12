import { describe, expect, test } from 'vitest';
import { pickTabsToDelete } from '@/usecases/pick-tabs-to-delete';
import { BACKUP_MAX_TABS } from '@/config/backup';

/** テスト用に HH-mm 形式のタブ名を作る（作成順 = 古い→新しい）。 */
function tabName(i: number): string {
  const hour = Math.floor(i / 60) % 24;
  const minute = i % 60;
  return `${String(hour).padStart(2, '0')}-${String(minute).padStart(2, '0')}`;
}

describe('消すタブの選び方: 新しい 60 個を残し、古いものだけ返す', () => {
  test('60 個以下なら何も消さない', () => {
    const tabs = Array.from({ length: BACKUP_MAX_TABS }, (_, i) => tabName(i));
    expect(pickTabsToDelete(tabs)).toEqual([]);
  });

  test('60 個を超えると、超えた分だけ古いものから消す', () => {
    const tabs = Array.from({ length: BACKUP_MAX_TABS + 5 }, (_, i) => tabName(i));
    const result = pickTabsToDelete(tabs);

    // 先頭（一番古い）5 個が消える対象
    expect(result).toEqual(tabs.slice(0, 5));

    // 新しい 60 個は消す対象に含まれない
    for (const name of tabs.slice(5)) {
      expect(result).not.toContain(name);
    }
  });

  test('ちょうど 61 個目で 1 個だけ消える', () => {
    const tabs = Array.from({ length: BACKUP_MAX_TABS + 1 }, (_, i) => tabName(i));
    expect(pickTabsToDelete(tabs)).toEqual([tabs[0]]);
  });
});

describe('HH-mm の形でない名前は絶対に返さない', () => {
  test('形式が違うタブ名は、他が 60 個を超えていても消す対象に入らない', () => {
    const validOld = Array.from({ length: BACKUP_MAX_TABS + 10 }, (_, i) => tabName(i));
    const tabs = ['Sheet1', '10-15-2', 'メモ', ...validOld];

    const result = pickTabsToDelete(tabs);

    expect(result).not.toContain('Sheet1');
    expect(result).not.toContain('10-15-2');
    expect(result).not.toContain('メモ');
  });

  test('HH-mm 形式のタブが 1 つも無ければ何も消さない', () => {
    expect(pickTabsToDelete(['Sheet1', 'メモ', '10-15-2'])).toEqual([]);
  });
});
