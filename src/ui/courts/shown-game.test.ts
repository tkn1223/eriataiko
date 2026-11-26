import { describe, expect, test } from 'vitest';
import { defaultShownGame, earlierPlayedGames, nextGameToOffer } from '@/ui/courts/shown-game';

describe('defaultShownGame（カードの真ん中に「第Nゲーム」と出すゲーム）', () => {
  test('点がまだ 1 つも無ければ第1ゲーム', () => {
    expect(defaultShownGame([], 3)).toBe(1);
    expect(defaultShownGame([{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }], 3)).toBe(1);
  });

  test('点が入っているゲームのうち、いちばん後ろのゲームを出す', () => {
    const scores = [
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 14, sideBScore: 11 },
    ];
    expect(defaultShownGame(scores, 3)).toBe(2);
  });

  test('1 ゲーム制はいつも第1ゲーム', () => {
    expect(defaultShownGame([{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }], 1)).toBe(1);
  });

  test('上限ゲーム数を超えた番号は出さない', () => {
    expect(defaultShownGame([{ gameNumber: 4, sideAScore: 1, sideBScore: 0 }], 3)).toBe(3);
  });
});

describe('earlierPlayedGames（上に札で出す、終わったゲーム）', () => {
  const scores = [
    { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
    { gameNumber: 2, sideAScore: 14, sideBScore: 11 },
  ];

  test('出しているゲームより前の、点が入ったゲームだけ（番号順）', () => {
    expect(earlierPlayedGames(scores, 2).map((g) => g.gameNumber)).toEqual([1]);
  });

  test('第1ゲームを出しているあいだは無い', () => {
    expect(earlierPlayedGames(scores, 1)).toEqual([]);
  });

  test('0 対 0 のゲームは終わったゲームではない', () => {
    const withEmpty = [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }];
    expect(earlierPlayedGames(withEmpty, 2)).toEqual([]);
  });
});

describe('nextGameToOffer（「第N+1ゲームへ進む」を出すか。docs/specs/2026-11-23-next-game-button.md）', () => {
  const game = (gameNumber: number, a: number, b: number) => ({
    gameNumber,
    sideAScore: a,
    sideBScore: b,
  });

  test('上限 3 ゲームで第1ゲームに点が入り勝負がついていなければ、第2ゲームを出す', () => {
    expect(nextGameToOffer([game(1, 21, 15)], 3, 1)).toBe(2);
  });

  test('1-1 で第2ゲームを出していれば、第3ゲームを出す', () => {
    expect(nextGameToOffer([game(1, 21, 15), game(2, 15, 21)], 3, 2)).toBe(3);
  });

  test('最後のゲームを出しているときは出さない', () => {
    expect(nextGameToOffer([game(1, 21, 15), game(2, 15, 21), game(3, 5, 3)], 3, 3)).toBeNull();
  });

  // 第2ゲームの途中でリードしただけでも、今の数え方では「2 ゲーム取った」になる。途中かどうかは点から分からないので、
  // 最後のゲームまでは「進む」を出し続け、終わらせるのは下の「ここで試合終了」に任せる（11/26 yosuke さん）
  test('第1ゲームを取った側が第2ゲームでリードしていても（数え方では 2-0）、最後のゲームより前なら第3ゲームを出す', () => {
    expect(nextGameToOffer([game(1, 21, 6), game(2, 19, 16)], 3, 2)).toBe(3);
  });

  test('1 ゲームの試合（予選）は出さない', () => {
    expect(nextGameToOffer([game(1, 10, 8)], 1, 1)).toBeNull();
  });

  test('まだ 1 点も無い第1ゲームでも、複数ゲームの試合なら第2ゲームを出す', () => {
    expect(nextGameToOffer([], 3, 1)).toBe(2);
  });

  test('前のゲームを見直しているとき（第1ゲームのタブ）は、次の第2ゲームを出す', () => {
    expect(nextGameToOffer([game(1, 21, 15), game(2, 15, 21)], 3, 1)).toBe(2);
  });

  test('上限 2 ゲームでは、第1ゲームなら点に関係なく第2ゲームを出し、第2ゲームでは出さない', () => {
    expect(nextGameToOffer([game(1, 10, 10)], 2, 1)).toBe(2);
    expect(nextGameToOffer([game(1, 21, 15)], 2, 1)).toBe(2);
    expect(nextGameToOffer([game(1, 10, 10)], 2, 2)).toBeNull();
  });

  test('上限 5 ゲームで 2-1 なら、第4ゲームを出す。2-2 で第5ゲームを出していれば出さない', () => {
    const twoOne = [game(1, 21, 15), game(2, 15, 21), game(3, 21, 10)];
    expect(nextGameToOffer(twoOne, 5, 3)).toBe(4);
    expect(nextGameToOffer([...twoOne, game(4, 10, 21)], 5, 5)).toBeNull();
  });

  test('いま出しているゲームが同点（20-20）でも、勝負はついていないので次のゲームを出す', () => {
    expect(nextGameToOffer([game(1, 20, 20)], 3, 1)).toBe(2);
  });
});
