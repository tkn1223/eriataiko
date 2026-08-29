import { describe, expect, test } from 'vitest';
import { hasAnyPoint, playedGameScores } from '@/domain/scoring';

describe('playedGameScores が 0 対 0 のゲームを除く', () => {
  test('0 対 0 のゲームだけを渡すと空になる', () => {
    const result = playedGameScores([{ gameNumber: 2, sideAScore: 0, sideBScore: 0 }]);
    expect(result).toEqual([]);
  });

  test('点が入っているゲームは残る', () => {
    const played = { gameNumber: 1, sideAScore: 21, sideBScore: 15 };
    const empty = { gameNumber: 2, sideAScore: 0, sideBScore: 0 };
    const result = playedGameScores([played, empty]);
    expect(result).toEqual([played]);
  });

  test('片方だけでも点が入っていれば 0 対 0 とはみなさない', () => {
    const oneSided = { gameNumber: 1, sideAScore: 21, sideBScore: 0 };
    expect(playedGameScores([oneSided])).toEqual([oneSided]);
  });

  test('空配列を渡すと空配列を返す', () => {
    expect(playedGameScores([])).toEqual([]);
  });
});

describe('hasAnyPoint が 1 点でも入っているかを返す', () => {
  test('すべて 0 対 0 なら false', () => {
    expect(
      hasAnyPoint([
        { gameNumber: 1, sideAScore: 0, sideBScore: 0 },
        { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
      ])
    ).toBe(false);
  });

  test('1 つでも点が入っていれば true', () => {
    expect(
      hasAnyPoint([
        { gameNumber: 1, sideAScore: 1, sideBScore: 0 },
        { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
      ])
    ).toBe(true);
  });

  test('空配列なら false', () => {
    expect(hasAnyPoint([])).toBe(false);
  });
});
