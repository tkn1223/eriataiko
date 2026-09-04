import { describe, expect, test } from 'vitest';
import { gamesToWin, matchOutcome, winnerOfGame } from '@/domain/match-rules';

describe('gamesToWin が上限ゲーム数から勝ちに必要なゲーム数を返す', () => {
  test('上限1のとき1を返す（予選リーグ）', () => {
    expect(gamesToWin(1)).toBe(1);
  });

  test('上限3のとき2を返す（決勝トーナメント）', () => {
    expect(gamesToWin(3)).toBe(2);
  });

  test('上限5のとき3を返す', () => {
    expect(gamesToWin(5)).toBe(3);
  });

  test('上限0は「1以上にしてください」と言って止まる', () => {
    expect(() => gamesToWin(0)).toThrow(/1 以上/);
  });

  test('上限が負の数のときも止まる', () => {
    expect(() => gamesToWin(-1)).toThrow(/1 以上/);
  });

  test('上限が整数でないときも止まる', () => {
    expect(() => gamesToWin(2.5)).toThrow(/1 以上/);
  });
});

describe('winnerOfGame が1ゲームの勝者を返す', () => {
  test('Aの得点が多ければAを返す', () => {
    expect(winnerOfGame([21, 15])).toBe('A');
  });

  test('Bの得点が多ければBを返す', () => {
    expect(winnerOfGame([15, 21])).toBe('B');
  });

  test('同点はnullを返す', () => {
    expect(winnerOfGame([15, 15])).toBeNull();
  });
});

describe('matchOutcome が試合の終了と勝者を判定する', () => {
  test('予選（上限1ゲーム）は、1ゲーム終わると試合終了になる', () => {
    const result = matchOutcome([[21, 19]], 1);

    expect(result).toEqual({ finished: true, winner: 'A', wonGames: [1, 0] });
  });

  test('予選（上限1ゲーム）は、まだゲームが終わっていなければ試合終了にならない', () => {
    const result = matchOutcome([], 1);

    expect(result).toEqual({ finished: false, winner: null, wonGames: [0, 0] });
  });

  test('決勝（上限3ゲーム）は、1ゲーム勝っただけではまだ試合終了にならない', () => {
    const result = matchOutcome([[21, 19]], 3);

    expect(result).toEqual({ finished: false, winner: null, wonGames: [1, 0] });
  });

  test('決勝（上限3ゲーム）は、2ゲーム先取で試合終了になる', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [21, 15],
      ],
      3
    );

    expect(result).toEqual({ finished: true, winner: 'A', wonGames: [2, 0] });
  });

  test('決勝（上限3ゲーム）で1-1になったら、まだ試合終了にならず第3ゲームに進む', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [15, 21],
      ],
      3
    );

    expect(result).toEqual({ finished: false, winner: null, wonGames: [1, 1] });
  });

  test('決勝（上限3ゲーム）で1-1から第3ゲームの勝者で試合終了になる', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [15, 21],
        [21, 18],
      ],
      3
    );

    expect(result).toEqual({ finished: true, winner: 'A', wonGames: [2, 1] });
  });

  test('決勝（上限3ゲーム）で1-1から第3ゲームをBが取ったらBの試合終了になる', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [15, 21],
        [18, 21],
      ],
      3
    );

    expect(result).toEqual({ finished: true, winner: 'B', wonGames: [1, 2] });
  });

  test('上限0で呼ばれたら、試合終了と答えずに止まる', () => {
    expect(() => matchOutcome([], 0)).toThrow(/1 以上/);
  });

  test('上限1で同点のまま1ゲーム消化したら、試合終了だが勝者は決まらない', () => {
    const result = matchOutcome([[15, 15]], 1);

    expect(result).toEqual({ finished: true, winner: null, wonGames: [0, 0] });
  });

  test('上限3で同点のゲームが混ざって3ゲーム消化し1-1なら、試合終了だが勝者は決まらない', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [15, 21],
        [15, 15],
      ],
      3
    );

    expect(result).toEqual({ finished: true, winner: null, wonGames: [1, 1] });
  });

  test('上限3で同点のゲームが混ざっても、2ゲーム先取していれば勝者が決まる', () => {
    const result = matchOutcome(
      [
        [15, 15],
        [21, 19],
        [21, 15],
      ],
      3
    );

    expect(result).toEqual({ finished: true, winner: 'A', wonGames: [2, 0] });
  });

  test('上限ゲーム数に達したらそこで試合終了になる', () => {
    const result = matchOutcome(
      [
        [21, 19],
        [15, 21],
        [21, 18],
      ],
      3
    );

    expect(result.finished).toBe(true);
  });
});
