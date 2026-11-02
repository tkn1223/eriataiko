import { describe, expect, test } from 'vitest';
import { deriveMatchesCourts } from '@/ui/matches/derive-matches-courts';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 試合の一覧から、進行表のコートのカードを組み立てる決まりの確認。
 * 届いた変化を当てたあとも、サーバーから読んだ直後も、同じ関数でカードの形にする。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

describe('deriveMatchesCourts', () => {
  test('試合のあるコートだけが、番号順に出る。9・10番も数として並ぶ（文字の順ではない）', () => {
    const courts = deriveMatchesCourts([
      boardMatch({ matchId: 'a', courtNumber: 10 }),
      boardMatch({ matchId: 'b', courtNumber: 2 }),
      boardMatch({ matchId: 'c', courtNumber: 9 }),
    ]);

    expect(courts.map((court) => court.courtNumber)).toEqual([2, 9, 10]);
  });

  test('番号が飛んでいても飛んだまま出る（間を埋めない）', () => {
    const courts = deriveMatchesCourts([
      boardMatch({ matchId: 'a', courtNumber: 1 }),
      boardMatch({ matchId: 'b', courtNumber: 4 }),
    ]);

    expect(courts.map((court) => court.courtNumber)).toEqual([1, 4]);
  });

  test('終わった試合しかないコートも出る（見出しは「すべて終了」になる）', () => {
    const courts = deriveMatchesCourts([
      boardMatch({ matchId: 'a', courtNumber: 3, status: 'done' }),
    ]);

    expect(courts.map((court) => court.courtNumber)).toEqual([3]);
  });

  test('コートが決まっていない試合は、最後に 1 つのカード（courtNumber が null）にまとまる', () => {
    const courts = deriveMatchesCourts([
      boardMatch({ matchId: 'u1', courtNumber: null, orderInCourt: null }),
      boardMatch({ matchId: 'a', courtNumber: 8 }),
      boardMatch({ matchId: 'u2', courtNumber: null, orderInCourt: null }),
      boardMatch({ matchId: 'b', courtNumber: 1 }),
    ]);

    expect(courts.map((court) => court.courtNumber)).toEqual([1, 8, null]);
    const undecided = courts[2];
    expect(undecided.key).toBe('undecided');
    expect(undecided.matches.map((m) => m.matchId)).toEqual(['u1', 'u2']);
  });

  test('コートが決まっていない試合が無ければ、「コート未定」のカードは出ない', () => {
    const courts = deriveMatchesCourts([boardMatch({ courtNumber: 1 })]);

    expect(courts.some((court) => court.courtNumber === null)).toBe(false);
  });

  test('カードの中の試合は、試合順（orderInCourt）の小さい順。順番が未定のものは最後', () => {
    const [court] = deriveMatchesCourts([
      boardMatch({ matchId: 'third', orderInCourt: 3 }),
      boardMatch({ matchId: 'none', orderInCourt: null }),
      boardMatch({ matchId: 'first', orderInCourt: 1 }),
      boardMatch({ matchId: 'tenth', orderInCourt: 10 }),
    ]);

    expect(court.matches.map((m) => m.matchId)).toEqual(['first', 'third', 'tenth', 'none']);
  });

  test('試合が 1 つも無ければ、カードも 0 枚', () => {
    expect(deriveMatchesCourts([])).toEqual([]);
  });

  test('開閉の状態を覚える鍵は、コート番号（未定は undecided）', () => {
    const courts = deriveMatchesCourts([
      boardMatch({ matchId: 'a', courtNumber: 3 }),
      boardMatch({ matchId: 'b', courtNumber: null, orderInCourt: null }),
    ]);

    expect(courts.map((court) => court.key)).toEqual(['3', 'undecided']);
  });
});
