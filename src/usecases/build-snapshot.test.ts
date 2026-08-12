import { describe, expect, test } from 'vitest';
import { buildSnapshot } from '@/usecases/build-snapshot';
import { BACKUP_MAX_ROWS } from '@/config/backup';

// 2026-08-13T01:15:00Z は日本時間で 10:15。
// タブ名に時刻を使うため、テストで固定できるように now は引数で渡す
// （build-snapshot.ts の中で new Date() を呼ばない）。
const NOW = new Date('2026-08-13T01:15:00Z');

describe('タブ名が日本時間の HH-mm になる', () => {
  test('UTC の時刻から日本時間の HH-mm に変換される', () => {
    const result = buildSnapshot({ now: NOW, existingTabNames: [], tables: [] });
    expect(result.tabName).toBe('10-15');
  });

  test('日付をまたぐ時刻でも日本時間で計算される', () => {
    // UTC 2026-08-12T15:05:00Z = 日本時間 2026-08-13 00:05
    const result = buildSnapshot({
      now: new Date('2026-08-12T15:05:00Z'),
      existingTabNames: [],
      tables: [],
    });
    expect(result.tabName).toBe('00-05');
  });
});

describe('タブ名が既にあるとき別名になる', () => {
  test('同じ名前が 1 つあるとき 10-15-2 になる', () => {
    const result = buildSnapshot({ now: NOW, existingTabNames: ['10-15'], tables: [] });
    expect(result.tabName).toBe('10-15-2');
  });

  test('10-15 と 10-15-2 が両方あるとき 10-15-3 になる', () => {
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: ['10-15', '10-15-2'],
      tables: [],
    });
    expect(result.tabName).toBe('10-15-3');
  });

  test('他の時刻のタブ名があっても影響しない', () => {
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: ['10-00', '10-30'],
      tables: [],
    });
    expect(result.tabName).toBe('10-15');
  });
});

describe('空の表でも落ちない', () => {
  test('行が 0 件でも例外にならず、見出しだけの表になる', () => {
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: [],
      tables: [{ table: 'operators', label: '運営者', rows: [] }],
    });
    expect(result.values[0]).toEqual(['運営者']);
  });
});

describe('対象の表が見出し付きで縦に並ぶ', () => {
  test('複数の表が、それぞれ見出し・列名・データの順で縦に積まれる', () => {
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: [],
      tables: [
        {
          table: 'operators',
          label: '運営者',
          rows: [{ id: '1', name: '太郎' }],
        },
        {
          table: 'write_logs',
          label: '書き込み履歴',
          rows: [{ id: 1, action: 'session.enter' }],
        },
      ],
    });

    // 1 つ目の表: 見出し → 列名 → データ
    expect(result.values[0]).toEqual(['運営者']);
    expect(result.values[1]).toEqual(['id', 'name']);
    expect(result.values[2]).toEqual(['1', '太郎']);

    // 空行を挟んで 2 つ目の表が続く
    const secondHeadingIndex = result.values.findIndex((row) => row[0] === '書き込み履歴');
    expect(secondHeadingIndex).toBeGreaterThan(2);
    expect(result.values[secondHeadingIndex + 1]).toEqual(['id', 'action']);
    expect(result.values[secondHeadingIndex + 2]).toEqual([1, 'session.enter']);
  });
});

describe('表の行が上限を超えたとき「一部だけです」と分かる文字が入る', () => {
  test('上限ちょうどまでは通常どおりの見出しになる', () => {
    const rows = Array.from({ length: BACKUP_MAX_ROWS }, (_, i) => ({ id: i }));
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: [],
      tables: [{ table: 'operators', label: '運営者', rows }],
    });
    expect(result.values[0]).toEqual(['運営者']);
  });

  test('上限を 1 件でも超えると見出しに「一部だけです」が入り、データは上限件数までに切られる', () => {
    const rows = Array.from({ length: BACKUP_MAX_ROWS + 1 }, (_, i) => ({ id: i }));
    const result = buildSnapshot({
      now: NOW,
      existingTabNames: [],
      tables: [{ table: 'operators', label: '運営者', rows }],
    });

    expect(String(result.values[0][0])).toContain('一部だけです');

    // values[0] = 見出し, values[1] = 列名, values[2..] = データ
    const dataRows = result.values.slice(2, 2 + BACKUP_MAX_ROWS);
    expect(dataRows).toHaveLength(BACKUP_MAX_ROWS);
    expect(dataRows[dataRows.length - 1]).toEqual([BACKUP_MAX_ROWS - 1]);
  });
});
