import { describe, expect, test } from 'vitest';
import {
  SCORER_EXPIRY_MS,
  decideClaim,
  lastScoredAtOf,
  scorerLabel,
  scorerStanding,
  type ScorerSlot,
} from '@/domain/scorer';

const NOW = new Date('2027-01-22T10:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const ME = 'me';
const SOMEONE = 'someone';

describe('担当が外れるまでの時間', () => {
  test('5 分である', () => {
    expect(SCORER_EXPIRY_MS).toBe(5 * 60 * 1000);
  });
});

describe('担当の立場（自分か・空いているか・ほかの人か）', () => {
  test('担当が自分なら、いつ点を入れたかに関わらず「自分」', () => {
    expect(scorerStanding({ holderId: ME, lastScoredAt: minutesAgo(0) }, ME, NOW)).toBe('mine');
    // 5 分以上たっていても、ほかの人が取っていないうちは自分のまま（次の 1 点で時刻が更新される）
    expect(scorerStanding({ holderId: ME, lastScoredAt: minutesAgo(30) }, ME, NOW)).toBe('mine');
  });

  test('担当がいなければ「空いている」', () => {
    expect(scorerStanding({ holderId: null, lastScoredAt: null }, ME, NOW)).toBe('vacant');
  });

  test('ほかの人が 5 分以内に点を入れていれば「ほかの人」', () => {
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: minutesAgo(0) }, ME, NOW)).toBe(
      'other'
    );
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: minutesAgo(4.99) }, ME, NOW)).toBe(
      'other'
    );
  });

  test('ちょうど 5 分たったら、ほかの人の担当は外れて「空いている」', () => {
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: minutesAgo(5) }, ME, NOW)).toBe(
      'vacant'
    );
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: minutesAgo(60) }, ME, NOW)).toBe(
      'vacant'
    );
  });

  test('担当はいるが時刻が無い（ありえない並び）なら、空いている扱い', () => {
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: null }, ME, NOW)).toBe('vacant');
  });

  test('自分の時計が少し進んでいて時刻が未来でも、ほかの人の担当は外れない', () => {
    const future = new Date(NOW.getTime() + 3_000);
    expect(scorerStanding({ holderId: SOMEONE, lastScoredAt: future }, ME, NOW)).toBe('other');
  });
});

describe('最後に点を入れた時刻（担当になった時刻と、点が最後に保存された時刻の遅いほう）', () => {
  test('担当になってから点が保存されていれば、点が保存された時刻', () => {
    expect(lastScoredAtOf({ claimedAt: minutesAgo(10), lastScoreSavedAt: minutesAgo(2) })).toEqual(
      minutesAgo(2)
    );
  });

  test('点が担当になる前（前の担当の点）か 1 点も無ければ、担当になった時刻', () => {
    expect(lastScoredAtOf({ claimedAt: minutesAgo(1), lastScoreSavedAt: minutesAgo(8) })).toEqual(
      minutesAgo(1)
    );
    expect(lastScoredAtOf({ claimedAt: minutesAgo(1), lastScoreSavedAt: null })).toEqual(
      minutesAgo(1)
    );
  });

  test('担当になった時刻が無い（担当がいない）なら、点があっても null', () => {
    expect(lastScoredAtOf({ claimedAt: null, lastScoreSavedAt: minutesAgo(1) })).toBeNull();
  });
});

describe('担当を取る決まり', () => {
  const vacant: ScorerSlot = { holderId: null, lastScoredAt: null };
  const otherActive: ScorerSlot = { holderId: SOMEONE, lastScoredAt: minutesAgo(1) };
  const otherExpired: ScorerSlot = { holderId: SOMEONE, lastScoredAt: minutesAgo(5) };
  const mine: ScorerSlot = { holderId: ME, lastScoredAt: minutesAgo(1) };

  test('空いていれば、確認なしで取れる', () => {
    expect(decideClaim(vacant, ME, false, NOW)).toBe('claim');
  });

  test('5 分たった担当は、確認なしで取れる', () => {
    expect(decideClaim(otherExpired, ME, false, NOW)).toBe('claim');
  });

  test('ほかの人が担当中（5 分以内）なら、「引き継ぐ」と明示しないと取れない', () => {
    expect(decideClaim(otherActive, ME, false, NOW)).toBe('refuse');
  });

  test('ほかの人が担当中でも、「引き継ぐ」と明示すれば取れる', () => {
    expect(decideClaim(otherActive, ME, true, NOW)).toBe('takeover');
  });

  test('空いているときに「引き継ぐ」と送っても、ただ取るだけ（引き継ぎとは記録しない）', () => {
    expect(decideClaim(vacant, ME, true, NOW)).toBe('claim');
    expect(decideClaim(otherExpired, ME, true, NOW)).toBe('claim');
  });

  test('もう自分が担当なら、取り直しは時刻の更新だけ（二重に押されても壊れない）', () => {
    expect(decideClaim(mine, ME, false, NOW)).toBe('renew');
    expect(decideClaim(mine, ME, true, NOW)).toBe('renew');
  });
});

describe('担当の名前（チーム名つき）', () => {
  test('チームがあれば「愛知南のたろう」', () => {
    expect(scorerLabel({ teamName: '愛知南', playerName: 'たろう' })).toBe('愛知南のたろう');
  });

  test('チームが無ければ名前だけ', () => {
    expect(scorerLabel({ teamName: null, playerName: '本部' })).toBe('本部');
  });
});
