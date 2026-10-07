import { describe, expect, test } from 'vitest';
import {
  CLASS_COLOR_COUNT,
  classColorClasses,
  classColorNumberAt,
  classLabelsByDivisionId,
  hasTeamColor,
  teamBgClass,
} from '@/domain/class-labels';
import * as classLabels from '@/domain/class-labels';

describe('classLabelsByDivisionId', () => {
  test('部の文字は divisions.name をそのまま出す（名前を「初級」に変えたら「初級」になる）', () => {
    const labels = classLabelsByDivisionId([
      { id: 'a', name: '初級', sortOrder: 10 },
      { id: 'b', name: 'A級', sortOrder: 20 },
    ]);

    expect(labels.get('a')?.name).toBe('初級');
    expect(labels.get('b')?.name).toBe('A級');
  });

  test('色は sort_order の小さい順に 1 番から当てる（名前や id の順ではない）', () => {
    const labels = classLabelsByDivisionId([
      { id: 'c', name: '3部', sortOrder: 30 },
      { id: 'a', name: '1部', sortOrder: 10 },
      { id: 'b', name: '2部', sortOrder: 20 },
    ]);

    expect(labels.get('a')?.colorNumber).toBe(1);
    expect(labels.get('b')?.colorNumber).toBe(2);
    expect(labels.get('c')?.colorNumber).toBe(3);
  });

  test('6 部まで別々の色が付く', () => {
    const labels = classLabelsByDivisionId(
      [10, 20, 30, 40, 50, 60].map((sortOrder) => ({
        id: `d${sortOrder}`,
        name: `部${sortOrder}`,
        sortOrder,
      }))
    );

    const colors = [10, 20, 30, 40, 50, 60].map((n) => labels.get(`d${n}`)?.colorNumber);
    expect(colors).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('7 部目以降は 6 番目の色で止める（色が無くて壊れない）', () => {
    const labels = classLabelsByDivisionId(
      [10, 20, 30, 40, 50, 60, 70, 80].map((sortOrder) => ({
        id: `d${sortOrder}`,
        name: `部${sortOrder}`,
        sortOrder,
      }))
    );

    expect(labels.get('d70')?.colorNumber).toBe(6);
    expect(labels.get('d80')?.colorNumber).toBe(6);
  });

  test('部が無ければ空の表を返す', () => {
    expect(classLabelsByDivisionId([]).size).toBe(0);
  });
});

describe('classColorNumberAt', () => {
  test('0 番目から 1〜6 番の色になり、あふれたら 6 番で止まる', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 99].map(classColorNumberAt)).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
    expect(CLASS_COLOR_COUNT).toBe(6);
  });
});

describe('classColorClasses', () => {
  test('Tailwind が見つけられるよう、完全なクラス名で返す（1〜6 番）', () => {
    expect(classColorClasses(1)).toEqual({
      text: 'text-class-1',
      tint: 'bg-class-1-bg',
      dot: 'bg-class-1',
    });
    expect(classColorClasses(6)).toEqual({
      text: 'text-class-6',
      tint: 'bg-class-6-bg',
      dot: 'bg-class-6',
    });
  });
});

describe('teamBgClass', () => {
  test('チーム 1〜4 は番号どおりの色', () => {
    expect([1, 2, 3, 4].map(teamBgClass)).toEqual([
      'bg-team-1',
      'bg-team-2',
      'bg-team-3',
      'bg-team-4',
    ]);
  });

  test('チームに入っていない（null）人は薄い色', () => {
    expect(teamBgClass(null)).toBe('bg-hairline');
  });

  test('1〜4 に無い番号は 1 番の色に折り返さず、薄い色になる', () => {
    expect(teamBgClass(5)).toBe('bg-hairline');
    expect(teamBgClass(0)).toBe('bg-hairline');
  });

  test('色が付くのは 1〜4 だけ（薄い色の上は白文字にしない判断に使う）', () => {
    expect([1, 4].map(hasTeamColor)).toEqual([true, true]);
    expect([null, 0, 5].map(hasTeamColor)).toEqual([false, false, false]);
  });

  test('foldTeamNumber は無くなっている', () => {
    expect('foldTeamNumber' in classLabels).toBe(false);
  });
});
