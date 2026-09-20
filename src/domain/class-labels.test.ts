import { describe, expect, test } from 'vitest';
import { classLabelsByDivisionId, foldTeamNumber } from '@/domain/class-labels';

describe('classLabelsByDivisionId', () => {
  test('sort_order の小さい順に1部/2部/3部を当てる', () => {
    const labels = classLabelsByDivisionId([
      { id: 'c', sortOrder: 30 },
      { id: 'a', sortOrder: 10 },
      { id: 'b', sortOrder: 20 },
    ]);

    expect(labels.get('a')).toBe('1部');
    expect(labels.get('b')).toBe('2部');
    expect(labels.get('c')).toBe('3部');
  });

  test('4つ目以降は3部になる', () => {
    const labels = classLabelsByDivisionId([
      { id: 'a', sortOrder: 10 },
      { id: 'b', sortOrder: 20 },
      { id: 'c', sortOrder: 30 },
      { id: 'd', sortOrder: 40 },
    ]);

    expect(labels.get('d')).toBe('3部');
  });

  test('部が無ければ空の表を返す', () => {
    expect(classLabelsByDivisionId([]).size).toBe(0);
  });
});

describe('foldTeamNumber', () => {
  test('1〜4はそのまま', () => {
    expect(foldTeamNumber(1)).toBe(1);
    expect(foldTeamNumber(4)).toBe(4);
  });

  test('5以降は1から折り返す', () => {
    expect(foldTeamNumber(5)).toBe(1);
    expect(foldTeamNumber(8)).toBe(4);
    expect(foldTeamNumber(9)).toBe(1);
  });

  test('nullはnullのまま', () => {
    expect(foldTeamNumber(null)).toBeNull();
  });
});
