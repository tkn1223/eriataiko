import { describe, expect, test } from 'vitest';
import { scorerViewOf, UNKNOWN_SCORER_NAME } from '@/ui/courts/scorer-view';

/**
 * 画面が一つの試合の担当をどう見せるか（自分／いない／ほかの人）を決める。
 * 5 分・引き継ぎの決まりは `src/domain/scorer.ts`。ここは、画面が持つ値（参加者の id・ISO の時刻・
 * 名前の表）からそれを呼ぶ薄い層。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */

const NOW = Date.parse('2027-01-22T10:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const LABELS = { 'p-me': '愛知南のたろう', 'p-jiro': '愛知北のじろう' };

function view(overrides: Partial<Parameters<typeof scorerViewOf>[0]> = {}) {
  return scorerViewOf({
    scorerParticipantId: null,
    scorerClaimedAt: null,
    scoreSavedAtByGame: {},
    myParticipantId: 'p-me',
    labels: LABELS,
    now: NOW,
    ...overrides,
  });
}

describe('scorerViewOf', () => {
  test('担当がいなければ「いない」', () => {
    expect(view()).toEqual({ kind: 'vacant' });
  });

  test('自分が担当なら「自分」。5 分以上たっていても自分のまま', () => {
    expect(view({ scorerParticipantId: 'p-me', scorerClaimedAt: minutesAgo(1) })).toEqual({
      kind: 'mine',
    });
    expect(view({ scorerParticipantId: 'p-me', scorerClaimedAt: minutesAgo(30) })).toEqual({
      kind: 'mine',
    });
  });

  test('ほかの人が 5 分以内に点を入れていれば「ほかの人」。名前はチーム名つき', () => {
    expect(view({ scorerParticipantId: 'p-jiro', scorerClaimedAt: minutesAgo(4) })).toEqual({
      kind: 'other',
      name: '愛知北のじろう',
    });
  });

  test('ほかの人の担当が 5 分たったら「いない」になる', () => {
    expect(view({ scorerParticipantId: 'p-jiro', scorerClaimedAt: minutesAgo(5) })).toEqual({
      kind: 'vacant',
    });
  });

  test('担当になってから 5 分たっていても、その試合の点が 5 分以内に保存されていれば「ほかの人」', () => {
    expect(
      view({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: minutesAgo(10),
        scoreSavedAtByGame: { 1: minutesAgo(9), 2: minutesAgo(4) },
      })
    ).toEqual({ kind: 'other', name: '愛知北のじろう' });
    expect(
      view({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: minutesAgo(10),
        scoreSavedAtByGame: { 1: minutesAgo(9), 2: minutesAgo(6) },
      })
    ).toEqual({ kind: 'vacant' });
  });

  test('担当になる前の点（5 分以上前）があっても、担当になったばかりなら「ほかの人」', () => {
    expect(
      view({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: minutesAgo(1),
        scoreSavedAtByGame: { 1: minutesAgo(20) },
      })
    ).toEqual({ kind: 'other', name: '愛知北のじろう' });
  });

  test('名前の表に無い担当（読み込んだあとに入った参加者）は「ほかの人」と出す', () => {
    expect(view({ scorerParticipantId: 'p-new', scorerClaimedAt: minutesAgo(1) })).toEqual({
      kind: 'other',
      name: UNKNOWN_SCORER_NAME,
    });
  });

  test('観戦者（参加者の id が無い）は、担当がいれば「ほかの人」、いなければ「いない」。自分にはならない', () => {
    expect(
      view({
        myParticipantId: null,
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: minutesAgo(1),
      })
    ).toEqual({ kind: 'other', name: '愛知北のじろう' });
    expect(view({ myParticipantId: null })).toEqual({ kind: 'vacant' });
  });

  test('担当を取る操作を送っている間は、結果になった「自分」として見せる（電波が悪くても入力は止めない）', () => {
    expect(
      view({
        scorerParticipantId: 'p-jiro',
        scorerClaimedAt: minutesAgo(1),
        scorerOp: { kind: 'claim', retrying: true },
      })
    ).toEqual({ kind: 'mine' });
  });

  test('担当をやめる操作を送っている間は、「いない」として見せる', () => {
    expect(
      view({
        scorerParticipantId: 'p-me',
        scorerClaimedAt: minutesAgo(1),
        scorerOp: { kind: 'release', retrying: false },
      })
    ).toEqual({ kind: 'vacant' });
  });

  test('時刻が読めない担当は、いない扱い', () => {
    expect(view({ scorerParticipantId: 'p-jiro', scorerClaimedAt: 'ふしぎな時刻' })).toEqual({
      kind: 'vacant',
    });
  });
});
