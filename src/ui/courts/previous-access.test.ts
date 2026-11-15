import { describe, expect, test } from 'vitest';
import { previousRowAccess } from '@/ui/courts/previous-access';

const base = {
  canInput: true,
  playedInPrevious: false,
  scorerOfCurrent: 'vacant' as const,
  wasScorerOfPrevious: false,
  hasNoticeAboutPrevious: false,
};

describe('previousRowAccess（1つ前の行と［訂正］を出す相手）', () => {
  test('その試合に出た選手には、行も［訂正］も出る', () => {
    expect(previousRowAccess({ ...base, playedInPrevious: true })).toEqual({
      showRow: true,
      showFixButton: true,
    });
  });

  test('いまそのコートの試合の担当（自分）には、行も［訂正］も出る', () => {
    expect(previousRowAccess({ ...base, scorerOfCurrent: 'mine' })).toEqual({
      showRow: true,
      showFixButton: true,
    });
  });

  test('その 1 つ前の試合で入力担当だった人（試合には出ていない）には、いまの担当でなくても、行も［訂正］も出る', () => {
    for (const scorerOfCurrent of ['vacant', 'other', null] as const) {
      expect(previousRowAccess({ ...base, wasScorerOfPrevious: true, scorerOfCurrent })).toEqual({
        showRow: true,
        showFixButton: true,
      });
    }
  });

  test('出ていない選手で担当でもない人には出ない（担当がいない・ほかの人が担当・試合が無い）', () => {
    for (const scorerOfCurrent of ['vacant', 'other', null] as const) {
      expect(previousRowAccess({ ...base, scorerOfCurrent })).toEqual({
        showRow: false,
        showFixButton: false,
      });
    }
  });

  test('観戦者には、どんな条件でも出ない', () => {
    expect(
      previousRowAccess({
        canInput: false,
        playedInPrevious: true,
        scorerOfCurrent: 'mine',
        wasScorerOfPrevious: true,
        hasNoticeAboutPrevious: true,
      })
    ).toEqual({ showRow: false, showFixButton: false });
  });

  test('出す相手でなくても、その試合について知らせが残っている選手には、知らせのために行だけ出す（［訂正］は出さない）', () => {
    expect(
      previousRowAccess({ ...base, scorerOfCurrent: 'other', hasNoticeAboutPrevious: true })
    ).toEqual({ showRow: true, showFixButton: false });
  });
});
