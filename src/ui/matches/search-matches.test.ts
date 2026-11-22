import { describe, expect, test } from 'vitest';
import { searchMatches } from '@/ui/matches/search-matches';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 1c「探す」の決まり。選手名・チーム名の部分一致で、試合中 → これから → 終わった試合の順。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const board = [
  boardMatch({
    matchId: 'done-1',
    status: 'done',
    courtNumber: 1,
    orderInCourt: 1,
    maxGameCount: 3,
    teamA: { teamNumber: 1, teamName: 'あおぞら', players: ['ハルキ', 'ミドリ'], slotLabel: null },
    teamB: { teamNumber: 2, teamName: 'もりの', players: ['ケイ', 'ユイ'], slotLabel: null },
    scores: [
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 21, sideBScore: 18 },
    ],
  }),
  boardMatch({
    matchId: 'live-1',
    status: 'live',
    courtNumber: 1,
    orderInCourt: 3,
    teamA: { teamNumber: 1, teamName: 'あおぞら', players: ['ハルキ', 'ミドリ'], slotLabel: null },
    teamB: { teamNumber: 4, teamName: 'うみかぜ', players: ['トモ', 'リコ'], slotLabel: null },
  }),
  boardMatch({
    matchId: 'next-1',
    status: 'waiting',
    courtNumber: 2,
    orderInCourt: 5,
    teamA: { teamNumber: 2, teamName: 'もりの', players: ['ケイ', 'ユイ'], slotLabel: null },
    teamB: { teamNumber: 3, teamName: 'さくら', players: ['シン', 'ヒナ'], slotLabel: null },
  }),
  boardMatch({
    matchId: 'slot-1',
    status: 'waiting',
    courtNumber: 1,
    orderInCourt: 7,
    teamA: { teamNumber: null, players: [], slotLabel: '予選1位' },
    teamB: { teamNumber: null, players: [], slotLabel: '予選4位' },
  }),
];

describe('searchMatches', () => {
  test('選手名の一部で、その人が出る試合が試合中 → これから → 終わった試合の順に出る', () => {
    const result = searchMatches(board, 'ケイ');

    expect(result.upcoming.map((m) => m.matchId)).toEqual(['next-1']);
    expect(result.done.map((m) => m.matchId)).toEqual(['done-1']);

    const haruki = searchMatches(board, 'ハル');
    expect(haruki.live.map((m) => m.matchId)).toEqual(['live-1']);
    expect(haruki.done.map((m) => m.matchId)).toEqual(['done-1']);
  });

  test('チーム名の一部でも探せる', () => {
    const result = searchMatches(board, 'さく');

    expect(result.upcoming.map((m) => m.matchId)).toEqual(['next-1']);
  });

  test('前後の空白は無視し、空の入力では何も出さない', () => {
    expect(searchMatches(board, '  ケイ ').done).toHaveLength(1);
    const empty = searchMatches(board, '   ');
    expect([...empty.live, ...empty.upcoming, ...empty.done]).toEqual([]);
  });

  test('当たる人がいなければ、どの欄も空', () => {
    const result = searchMatches(board, 'ぜんぜん違う');

    expect([...result.live, ...result.upcoming, ...result.done]).toEqual([]);
  });

  test('「予選1位」のような未定の枠の名前では当たらない（まだ誰でもない）', () => {
    expect(searchMatches(board, '予選').upcoming).toEqual([]);
  });

  test('終わった試合の見出し用に、探した側の勝ち数・負け数が出る', () => {
    const result = searchMatches(board, 'ハルキ');

    expect(result.record).toEqual({ wins: 1, losses: 0 });
    expect(searchMatches(board, 'ケイ').record).toEqual({ wins: 0, losses: 1 });
  });

  test('両側に当たる（チーム名が同じ等で探した側が決まらない）試合は、勝敗に数えない', () => {
    const both = searchMatches(
      [
        boardMatch({
          matchId: 'x',
          status: 'done',
          teamA: { teamNumber: 1, players: ['山田'], slotLabel: null },
          teamB: { teamNumber: 2, players: ['山本'], slotLabel: null },
          scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 5 }],
        }),
      ],
      '山'
    );
    expect(both.done).toHaveLength(1);
    expect(both.record).toEqual({ wins: 0, losses: 0 });
  });
});
