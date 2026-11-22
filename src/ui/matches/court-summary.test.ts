import { describe, expect, test } from 'vitest';
import { summarizeCourt } from '@/ui/matches/court-summary';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 1a のコートのカードに出す「いまの試合・次の試合・進み具合の線・▲あなた」の決まり。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

describe('summarizeCourt', () => {
  test('試合中の試合があれば、それがいまの試合。次はその次の未実施の試合', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'live' }),
      boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting' }),
      boardMatch({ matchId: 'd', orderInCourt: 4, status: 'waiting' }),
    ]);

    expect(summary.status).toBe('live');
    expect(summary.current?.matchId).toBe('b');
    expect(summary.next?.matchId).toBe('c');
  });

  test('試合中が無く未実施だけなら「呼出待ち」。先頭の未実施がいまの試合、その次が次', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'waiting' }),
      boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting' }),
    ]);

    expect(summary.status).toBe('waiting');
    expect(summary.current?.matchId).toBe('b');
    expect(summary.next?.matchId).toBe('c');
  });

  test('全部終わったコートは「全試合終了」で、いまの試合も次も無い', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'done' }),
    ]);

    expect(summary).toMatchObject({ status: 'finished', current: null, next: null });
    expect(summary.doneCount).toBe(2);
    expect(summary.total).toBe(2);
  });

  test('試合中が 2 つ（終了を取り消して直している）ときは、順番が後のほうがいまの試合', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'live' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'live' }),
    ]);

    expect(summary.current?.matchId).toBe('b');
  });

  test('進み具合の線は試合の数ぶん。終わった・試合中・これからが並び、呼出待ちのいまの試合は別の色', () => {
    const live = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'live' }),
      boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting' }),
    ]);
    const waiting = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'waiting' }),
      boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting' }),
    ]);

    expect(live.segments.map((segment) => segment.kind)).toEqual(['done', 'live', 'upcoming']);
    expect(waiting.segments.map((segment) => segment.kind)).toEqual([
      'done',
      'calling',
      'upcoming',
    ]);
  });

  test('自分の出番（未実施）の位置に印が付き、▲あなたの位置はその最初の 1 つ', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done', isMine: true }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'live' }),
      boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting' }),
      boardMatch({ matchId: 'd', orderInCourt: 4, status: 'waiting', isMine: true }),
      boardMatch({ matchId: 'e', orderInCourt: 5, status: 'waiting', isMine: true }),
    ]);

    expect(summary.segments.map((segment) => segment.mine)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(summary.myMarkIndex).toBe(3);
  });

  test('自分の出番が無いコートには ▲あなた の位置が無い（観戦者は全コートでこうなる）', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'waiting' }),
    ]);

    expect(summary.myMarkIndex).toBeNull();
  });

  test('自分が試合中のコートだけ「自分が試合中」になる', () => {
    const playing = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'live', isMine: true }),
    ]);
    const waitingOnly = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'waiting', isMine: true }),
    ]);

    expect(playing.isMineLive).toBe(true);
    expect(waitingOnly.isMineLive).toBe(false);
  });

  test('いまのゲーム番号は、点が入っている一番後ろのゲーム（無ければ第1）。終わったゲームの点も取れる', () => {
    const summary = summarizeCourt([
      boardMatch({
        matchId: 'a',
        orderInCourt: 1,
        status: 'live',
        maxGameCount: 3,
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 18 },
          { gameNumber: 2, sideAScore: 5, sideBScore: 3 },
        ],
      }),
    ]);

    expect(summary.shownGame).toBe(2);
    expect(summary.earlierGames).toEqual([{ gameNumber: 1, sideAScore: 21, sideBScore: 18 }]);
  });

  test('残りの試合数は、試合中も数える（最後の 1 試合が試合中なら残り 1）', () => {
    const summary = summarizeCourt([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'live' }),
    ]);

    expect(summary.remaining).toBe(1);
  });
});
