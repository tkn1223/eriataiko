import { describe, expect, test } from 'vitest';
import { buildPlayerRecord } from '@/domain/player-record';

describe('buildPlayerRecord が終了した試合の一覧から通算成績を出す', () => {
  test('勝った試合は wins に数え、ゲームと得失点も勝った分だけ積む', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 1,
        gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
        mySide: 'A',
      },
    ]);

    expect(record).toEqual({ wins: 1, losses: 0, gamesWon: 1, gamesLost: 0, pointDiff: 4 });
  });

  test('負けた試合は losses に数え、得失点はマイナスになる', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 1,
        gameScores: [{ gameNumber: 1, sideAScore: 11, sideBScore: 15 }],
        mySide: 'A',
      },
    ]);

    expect(record).toEqual({ wins: 0, losses: 1, gamesWon: 0, gamesLost: 1, pointDiff: -4 });
  });

  test('自分が B 側でも、B 側の得点を自分の得点として数える', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 1,
        gameScores: [{ gameNumber: 1, sideAScore: 11, sideBScore: 15 }],
        mySide: 'B',
      },
    ]);

    expect(record).toEqual({ wins: 1, losses: 0, gamesWon: 1, gamesLost: 0, pointDiff: 4 });
  });

  test('自分が B 側で負けた試合は、得失点がマイナスになる', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 1,
        gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
        mySide: 'B',
      },
    ]);

    expect(record).toEqual({ wins: 0, losses: 1, gamesWon: 0, gamesLost: 1, pointDiff: -4 });
  });

  // 最後のゲームが同点のまま「確定」を押されると、勝者が決まらないまま終了になる。
  // そのときに勝ち 1 でも負け 1 でも数えてしまうと、成績が実際と食い違う。
  test('勝者が決まらないまま終わった試合は、勝ちにも負けにも数えない', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 3,
        gameScores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
          { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
          { gameNumber: 3, sideAScore: 18, sideBScore: 18 },
        ],
        mySide: 'A',
      },
    ]);

    expect(record).toEqual({ wins: 0, losses: 0, gamesWon: 1, gamesLost: 1, pointDiff: 0 });
  });

  // ⚠️ 既知の食い違い（今回は直さない。PR #53 レビュー指摘2で「直し方は yosuke さんが決める」とされたもの）。
  // 上限ゲーム数（3）に満たないうちに試合が終了（決勝で 1 ゲームだけ行って終了、など）すると、
  // matchOutcome は「まだ決着していない」扱いにするので、実際には勝っていても
  // 0 勝 0 敗のまま数えられない。ここでは「今の実装がこう動く」ことを固定するだけで、
  // これが正しい仕様だと主張するテストではない。
  test('上限ゲーム数に満たないまま終了した試合は、いまの実装では勝ちにも負けにも数えない', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 3,
        gameScores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
        mySide: 'A',
      },
    ]);

    expect(record).toEqual({ wins: 0, losses: 0, gamesWon: 1, gamesLost: 0, pointDiff: 6 });
  });

  test('複数試合の成績をまとめて集計する', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 1,
        gameScores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 11 }],
        mySide: 'A',
      }, // 勝ち
      {
        maxGameCount: 3,
        gameScores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
          { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
          { gameNumber: 3, sideAScore: 18, sideBScore: 21 },
        ],
        mySide: 'A',
      }, // 負け（1-2）
    ]);

    expect(record).toEqual({
      wins: 1,
      losses: 1,
      gamesWon: 2,
      gamesLost: 2,
      pointDiff: 15 - 11 + (21 - 19) + (15 - 21) + (18 - 21),
    });
  });

  test('0 対 0 のゲームは数えない（まだ行われていない枠として扱う）', () => {
    const record = buildPlayerRecord([
      {
        maxGameCount: 3,
        gameScores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
          { gameNumber: 2, sideAScore: 21, sideBScore: 18 },
          { gameNumber: 3, sideAScore: 0, sideBScore: 0 },
        ],
        mySide: 'A',
      },
    ]);

    expect(record).toEqual({ wins: 1, losses: 0, gamesWon: 2, gamesLost: 0, pointDiff: 9 });
  });

  test('試合が 0 件のときはすべて 0 になる', () => {
    expect(buildPlayerRecord([])).toEqual({
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointDiff: 0,
    });
  });
});
