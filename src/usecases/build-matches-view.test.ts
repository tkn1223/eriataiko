import { describe, expect, test } from 'vitest';
import { buildMatchesView, type MatchesViewInput } from '@/usecases/build-matches-view';
import type { CourtsViewMatchRow } from '@/usecases/build-courts-view';

/**
 * 進行表（/matches）の「DB の行 → 画面が持つ試合の一覧」。DB も画面も触らない。
 * コートごとの並べ方・見出しの数え方は画面の側（derive-matches-courts.test.ts）が確かめる
 * （届いた変化を当てたあとも同じ関数でカードにするため）。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

const DIVISIONS = [
  { id: 'div-2', name: '2部', sortOrder: 20 },
  { id: 'div-1', name: '1部', sortOrder: 10 },
];

function row(overrides: Partial<CourtsViewMatchRow> = {}): CourtsViewMatchRow {
  return {
    matchId: 'match-1',
    status: 'waiting',
    ending: 'normal',
    maxGameCount: 1,
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    divisionId: 'div-1',
    stageId: 'stage-1',
    roundName: '予選 1回戦',
    sideA: {
      teamNumber: 1,
      slotLabel: null,
      players: [
        { participantId: 'p-a2', orderInPair: 2, name: '鈴木' },
        { participantId: 'p-a1', orderInPair: 1, name: '佐藤' },
      ],
    },
    sideB: {
      teamNumber: 2,
      slotLabel: null,
      players: [{ participantId: 'p-b1', orderInPair: 1, name: '高橋' }],
    },
    gameScores: [],
    ...overrides,
  };
}

function input(overrides: Partial<MatchesViewInput> = {}): MatchesViewInput {
  return {
    myParticipantId: null,
    divisions: DIVISIONS,
    matches: [row()],
    truncated: false,
    ...overrides,
  };
}

describe('buildMatchesView', () => {
  test('試合の行が、コート・試合順・部・回戦・両ペアの名前・点数つきの試合になる', () => {
    const view = buildMatchesView(
      input({
        matches: [
          row({
            status: 'done',
            courtNumber: 9,
            orderInCourt: 4,
            finishedAt: '2027-01-01T00:00:00Z',
            gameScores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
          }),
        ],
      })
    );

    expect(view.board).toHaveLength(1);
    expect(view.board[0]).toMatchObject({
      matchId: 'match-1',
      status: 'done',
      courtNumber: 9,
      orderInCourt: 4,
      roundLabel: '予選 1回戦',
      classLabel: { name: '1部', colorNumber: 1 },
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
    });
  });

  test('ペアの名前は、ペアの中の順番どおりに並ぶ', () => {
    const view = buildMatchesView(input());

    expect(view.board[0].teamA.players).toEqual(['佐藤', '鈴木']);
    expect(view.board[0].teamB.players).toEqual(['高橋']);
  });

  test('部の文字は divisions.name、色は並び順で決まる（class-labels.ts の決まりどおり）', () => {
    const view = buildMatchesView(
      input({ matches: [row({ divisionId: 'div-2', matchId: 'm2' })] })
    );

    // div-2 は並び順が 2 番目なので、色の番号は 2
    expect(view.board[0].classLabel).toEqual({ name: '2部', colorNumber: 2 });
  });

  test('部が大会の部の中に見つからなくても、別の部に見せず「部不明」にする', () => {
    const view = buildMatchesView(input({ matches: [row({ divisionId: 'div-none' })] }));

    expect(view.board[0].classLabel.name).toBe('部不明');
  });

  test('出場者がまだ決まっていない側は、名前が空で空枠ラベルが入る', () => {
    const view = buildMatchesView(
      input({
        matches: [
          row({
            sideB: { teamNumber: null, slotLabel: '予選1位', players: [] },
          }),
        ],
      })
    );

    expect(view.board[0].teamB).toEqual({ teamNumber: null, players: [], slotLabel: '予選1位' });
  });

  test('棄権の印（ending）がそのまま入る', () => {
    const view = buildMatchesView(
      input({ matches: [row({ status: 'done', ending: 'retired_side_b' })] })
    );

    expect(view.board[0].ending).toBe('retired_side_b');
  });

  test('選手として入った人が出る試合だけ isMine になる（どちら側でも）', () => {
    const view = buildMatchesView(
      input({
        myParticipantId: 'p-b1',
        matches: [
          row({ matchId: 'mine-b' }),
          row({
            matchId: 'not-mine',
            sideA: { teamNumber: 1, slotLabel: null, players: [] },
            sideB: {
              teamNumber: 2,
              slotLabel: null,
              players: [{ participantId: 'someone-else', orderInPair: 1, name: '別の人' }],
            },
          }),
        ],
      })
    );

    expect(view.board.map((m) => [m.matchId, m.isMine])).toEqual([
      ['mine-b', true],
      ['not-mine', false],
    ]);
  });

  test('観戦者（myParticipantId が null）には、どの試合も isMine が付かない', () => {
    const view = buildMatchesView(input({ myParticipantId: null }));

    expect(view.board.every((m) => m.isMine === false)).toBe(true);
  });

  test('読む上限を超えた印（truncated）がそのまま画面に渡る', () => {
    expect(buildMatchesView(input({ truncated: true })).truncated).toBe(true);
    expect(buildMatchesView(input({ truncated: false })).truncated).toBe(false);
  });

  test('試合が 1 つも無ければ、board は空になる', () => {
    expect(buildMatchesView(input({ matches: [] })).board).toEqual([]);
  });
});
