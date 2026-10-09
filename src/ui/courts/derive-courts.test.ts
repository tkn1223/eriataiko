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

  test('試合が別のコートに移ると、カードも移る', () => {
    const before = deriveCourts([match({ courtNumber: 1 })]);
    const after = deriveCourts([match({ courtNumber: 4 })]);

    expect(before.map((court) => court.courtNumber)).toEqual([1]);
    expect(after.map((court) => court.courtNumber)).toEqual([4]);
  });

  describe('進行中が 2 つあるとき', () => {
    test('順番が後の試合が今の試合で、前の試合は直し中になる', () => {
      const [court] = deriveCourts([
        match({ matchId: 'later', orderInCourt: 2 }),
        match({ matchId: 'earlier', orderInCourt: 1 }),
      ]);

      expect(court.live?.matchId).toBe('later');
      expect(court.fixing.map((fixing) => fixing.matchId)).toEqual(['earlier']);
    });

    test('進行中が 1 つなら、直し中は無い', () => {
      const [court] = deriveCourts([match()]);

      expect(court.fixing).toEqual([]);
    });

    test('取り消されたのを見た試合は、1 つだけでも直し中になる。今の試合は空になり、次の試合が呼出待ちに残る', () => {
      const [court] = deriveCourts([
        match({ matchId: 'fixed', reopened: true }),
        match({ matchId: 'next', status: 'waiting', orderInCourt: 2 }),
      ]);

      expect(court.fixing.map((fixing) => fixing.matchId)).toEqual(['fixed']);
      expect(court.live).toBeNull();
      expect(court.next?.matchId).toBe('next');
    });

    test('取り消された試合より順番が後の進行中があれば、そちらが今の試合', () => {
      const [court] = deriveCourts([
        match({ matchId: 'fixed', orderInCourt: 1, reopened: true }),
        match({ matchId: 'now', orderInCourt: 2 }),
      ]);

      expect(court.live?.matchId).toBe('now');
      expect(court.fixing.map((fixing) => fixing.matchId)).toEqual(['fixed']);
    });

    test('3 つ以上でも、今の試合以外は黙って消さずに全部直し中として残す', () => {
      const [court] = deriveCourts([
        match({ matchId: 'a', orderInCourt: 1 }),
        match({ matchId: 'b', orderInCourt: 2 }),
        match({ matchId: 'c', orderInCourt: 3 }),
      ]);

      expect(court.live?.matchId).toBe('c');
      expect(court.fixing.map((fixing) => fixing.matchId)).toEqual(['a', 'b']);
    });

    test('直し中の試合にも得点が入る', () => {
      const [court] = deriveCourts([
        match({
          matchId: 'earlier',
          orderInCourt: 1,
          scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
        }),
        match({ matchId: 'later', orderInCourt: 2 }),
      ]);

      expect(court.fixing[0].scores).toEqual([{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }]);
    });
  });

  describe('1 つ前の試合', () => {
    const OLD = '2026-10-09T01:00:00+00:00';
    const NEW = '2026-10-09T02:00:00+00:00';

    test('そのコートで終了の時刻が一番新しい終わった試合が、1 つ前になる', () => {
      const [court] = deriveCourts([
        match({ matchId: 'old', status: 'done', finishedAt: OLD }),
        match({ matchId: 'new', status: 'done', finishedAt: NEW }),
        match({ matchId: 'now', orderInCourt: 5 }),
      ]);

      expect(court.previous?.matchId).toBe('new');
    });

    test('時刻は日時として比べる（書き方が違っても新しいほうが勝つ）', () => {
      const [court] = deriveCourts([
        match({ matchId: 'a', status: 'done', finishedAt: '2026-10-09T02:00:00+00:00' }),
        match({ matchId: 'b', status: 'done', finishedAt: '2026-10-09T01:59:59.999Z' }),
        match({ matchId: 'now', orderInCourt: 5 }),
      ]);

      expect(court.previous?.matchId).toBe('a');
    });

    test('別のコートの終わった試合は混ざらない', () => {
      const courts = deriveCourts([
        match({ matchId: 'on-1', courtNumber: 1, status: 'done', finishedAt: OLD }),
        match({ matchId: 'on-2', courtNumber: 2, status: 'done', finishedAt: NEW }),
        match({ matchId: 'live-1', courtNumber: 1, orderInCourt: 5 }),
        match({ matchId: 'live-2', courtNumber: 2, orderInCourt: 5 }),
      ]);

      expect(courts.map((court) => court.previous?.matchId)).toEqual(['on-1', 'on-2']);
    });

    test('1 つ前には名前・部・得点が入る', () => {
      const [court] = deriveCourts([
        match({
          matchId: 'prev',
          status: 'done',
          finishedAt: NEW,
          scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
        }),
        match({ matchId: 'now', orderInCourt: 5 }),
      ]);

      expect(court.previous).toMatchObject({
        matchId: 'prev',
        roundLabel: '予選 1回戦',
        teamA: { players: ['佐藤', '鈴木'] },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
      });
    });

    test('終了の時刻が無い終わった試合は、1 つ前にしない（新しさを決められない）', () => {
      const courts = deriveCourts([match({ status: 'done', finishedAt: null })]);

      expect(courts).toEqual([]);
    });

    test('直し中の試合があるコートでは、1 つ前を出さない（2 つ以上前の試合を直せないように）', () => {
      const [court] = deriveCourts([
        match({ matchId: 'fixed', orderInCourt: 5, reopened: true }),
        match({ matchId: 'older', status: 'done', finishedAt: OLD }),
      ]);

      expect(court.previous).toBeNull();
    });

    test('進行中も未実施も無いコートでも、1 つ前があればカードになる（最後の試合を直せるように）', () => {
      const courts = deriveCourts([match({ status: 'done', finishedAt: NEW })]);

      expect(courts).toHaveLength(1);
      expect(courts[0]).toMatchObject({ live: null, next: null, fixing: [] });
      expect(courts[0].previous?.matchId).toBe('m-1');
    });

    test('コートが決まっていない終わった試合はカードにしない', () => {
      expect(deriveCourts([match({ status: 'done', finishedAt: NEW, courtNumber: null })])).toEqual(
        []
      );
    });

    test('1 つ前を直し始める（done → live）と、1 つ前は無くなる', () => {
      const before = deriveCourts([match({ status: 'done', finishedAt: NEW })]);
      const after = deriveCourts([match({ status: 'live', finishedAt: null, reopened: true })]);

      expect(before[0].previous?.matchId).toBe('m-1');
      expect(after[0].previous).toBeNull();
      expect(after[0].fixing.map((fixing) => fixing.matchId)).toEqual(['m-1']);
    });
  });
});
