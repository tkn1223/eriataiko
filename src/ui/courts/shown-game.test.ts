import { describe, expect, test } from 'vitest';
import { defaultShownGame, earlierPlayedGames } from '@/ui/courts/shown-game';

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
