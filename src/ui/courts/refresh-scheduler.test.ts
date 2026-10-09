import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createRefreshScheduler } from '@/ui/courts/refresh-scheduler';

/**
 * 「読み直して」の依頼をまとめる仕組み。
 * 知らない試合の変化が続けて届いても、読み直しは連続しない。
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRefreshScheduler', () => {
  test('依頼してすぐには読み直さず、少し待ってから 1 回だけ読み直す', () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, settleMs: 300, minIntervalMs: 3000 });

    scheduler.request();
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('待っている間に何度依頼されても、読み直しは 1 回にまとまる', () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, settleMs: 300, minIntervalMs: 3000 });

    scheduler.request();
    vi.advanceTimersByTime(100);
    scheduler.request();
    scheduler.request();
    vi.advanceTimersByTime(1000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('読み直した直後の依頼は、最小の間隔が空くまで待たされる（連続して読み直さない）', () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, settleMs: 300, minIntervalMs: 3000 });

    scheduler.request();
    vi.advanceTimersByTime(300);
    expect(refresh).toHaveBeenCalledTimes(1);

    // 読み直した 1 秒後にまた依頼が来ても、まだ読み直さない
    vi.advanceTimersByTime(1000);
    scheduler.request();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    // 前回から 3 秒たつと、まとめて 1 回だけ読み直す
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('依頼が続いても、読み直しは最小の間隔ごとに 1 回まで', () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, settleMs: 300, minIntervalMs: 3000 });

    // 10 秒間、100ms ごとに依頼し続ける
    for (let elapsed = 0; elapsed < 10_000; elapsed += 100) {
      scheduler.request();
      vi.advanceTimersByTime(100);
    }

    expect(refresh.mock.calls.length).toBeLessThanOrEqual(4);
  });

  test('止めると、待っていた読み直しは行われない', () => {
    const refresh = vi.fn();
    const scheduler = createRefreshScheduler({ refresh, settleMs: 300, minIntervalMs: 3000 });

    scheduler.request();
    scheduler.cancel();
    vi.advanceTimersByTime(5000);

    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * 読み直しの間に届いた変化を覚えておき、読み直した一覧に当て直せるようにする。
 * 読み直した一覧はサーバーが読んだ時点のもので、その後に届いた変化を含まないことがあるため。
 */
describe('読み直しの間に届いた変化', () => {
  test('読み直しを始めてから届いた変化だけを、届いた順に返す。返したら忘れる', () => {
    const scheduler = createRefreshScheduler<string>({
      refresh: vi.fn(),
      settleMs: 300,
      minIntervalMs: 3000,
    });

    scheduler.record('読み直す前');
    scheduler.request();
    scheduler.record('待っている間'); // まだ読んでいないので、読み直した一覧に入っている
    vi.advanceTimersByTime(300);
    scheduler.record('読み直し中 1');
    scheduler.record('読み直し中 2');

    expect(scheduler.takeChangesSinceRefresh()).toEqual(['読み直し中 1', '読み直し中 2']);
    expect(scheduler.takeChangesSinceRefresh()).toEqual([]);

    scheduler.record('読み直したあと');
    expect(scheduler.takeChangesSinceRefresh()).toEqual([]);
  });

  test('読み直しの返事が来ないまま変化が続いても、覚えるのは新しいほうから上限まで', () => {
    const scheduler = createRefreshScheduler<number>({
      refresh: vi.fn(),
      settleMs: 0,
      minIntervalMs: 0,
    });
    scheduler.request();
    vi.advanceTimersByTime(0);

    for (let change = 1; change <= 600; change += 1) scheduler.record(change);

    const recorded = scheduler.takeChangesSinceRefresh();
    expect(recorded).toHaveLength(500);
    expect(recorded.at(-1)).toBe(600);
  });

  test('取りやめたら（画面を離れたら）覚えていた変化も捨てる', () => {
    const scheduler = createRefreshScheduler<string>({
      refresh: vi.fn(),
      settleMs: 0,
      minIntervalMs: 0,
    });
    scheduler.request();
    vi.advanceTimersByTime(0);
    scheduler.record('変化');

    scheduler.cancel();

    expect(scheduler.takeChangesSinceRefresh()).toEqual([]);
  });
});
