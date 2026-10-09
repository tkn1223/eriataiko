import { describe, expect, test } from 'vitest';
import { deriveCourts } from '@/ui/courts/derive-courts';
import type { CourtMatch } from '@/ui/courts/types';

/**
 * 試合の一覧（`CourtMatch[]`）から、コートのカード（`Court[]`）を組み立てる決まりの確認。
 * 届いた変化を当てたあとも、サーバーから読んだ直後も、同じ関数でカードの形にする。
 */

function match(overrides: Partial<CourtMatch> = {}): CourtMatch {
  return {
    matchId: 'm-1',
    status: 'live',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    reopened: false,
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: { teamNumber: 1, players: ['佐藤', '鈴木'], slotLabel: null },
    teamB: { teamNumber: 2, players: ['高橋', '伊藤'], slotLabel: null },
    isMine: false,
    maxGameCount: 1,
    scores: [],
    ...overrides,
  };
}

describe('deriveCourts', () => {
  test('進行中の試合が live に入り、得点も一緒に入る', () => {
    const [court] = deriveCourts([
      match({ scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }] }),
    ]);

    expect(court.live?.matchId).toBe('m-1');
    expect(court.live?.scores).toEqual([{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }]);
    expect(court.next).toBeNull();
  });

  test('未実施の試合は order_in_court が最小のものが next に入る', () => {
    const [court] = deriveCourts([
      match({ matchId: 'w-3', status: 'waiting', orderInCourt: 3 }),
      match({ matchId: 'w-2', status: 'waiting', orderInCourt: 2 }),
    ]);

    expect(court.live).toBeNull();
    expect(court.next?.matchId).toBe('w-2');
  });

  test('順番が未定（null）の未実施は最後に回る', () => {
    const [court] = deriveCourts([
      match({ matchId: 'w-null', status: 'waiting', orderInCourt: null }),
      match({ matchId: 'w-9', status: 'waiting', orderInCourt: 9 }),
    ]);

    expect(court.next?.matchId).toBe('w-9');
  });

  test('コート番号の昇順で、試合の入っているコートだけカードになる。コート未定の試合はカードにしない', () => {
    const courts = deriveCourts([
      match({ matchId: 'a', courtNumber: 9 }),
      match({ matchId: 'b', courtNumber: 2 }),
      match({ matchId: 'c', courtNumber: null, status: 'waiting' }),
    ]);

    expect(courts.map((court) => court.courtNumber)).toEqual([2, 9]);
  });

  test('終わった試合だけのコートはカードにならない', () => {
    expect(deriveCourts([match({ status: 'done', finishedAt: '2026-10-09T01:00:00Z' })])).toEqual(
      []
    );
  });

  test('試合が別のコートに移ると、カードも移る', () => {
    const before = deriveCourts([match({ courtNumber: 1 })]);
    const after = deriveCourts([match({ courtNumber: 4 })]);

    expect(before.map((court) => court.courtNumber)).toEqual([1]);
    expect(after.map((court) => court.courtNumber)).toEqual([4]);
  });
});
