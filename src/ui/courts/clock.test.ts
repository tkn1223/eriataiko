import { afterEach, describe, expect, test, vi } from 'vitest';
import { createClock } from '@/ui/courts/clock';

/**
 * 画面が使う「いま」の時計。5 分で外れる担当を、画面が自分で時間を見て切り替えるために使う。
 * 描画の最中に Date.now() を読まない（読み直しのたびに値が変わると、描き直しが止まらなくなる）ため、
 * 値を持つ小さな外部ストアにして、決まったとき（一定の間隔・知らせが届いたとき）にだけ進める。
 */
afterEach(() => {
  vi.useRealTimers();
});

describe('createClock', () => {
  test('作った時点の時刻を持つ。進めるまで変わらない', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-22T10:00:00Z'));
    const clock = createClock();

    vi.setSystemTime(new Date('2027-01-22T10:03:00Z'));

    expect(clock.get()).toBe(Date.parse('2027-01-22T10:00:00Z'));
  });

  test('tick で現在の時刻に進み、見ている人に知らせる', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-22T10:00:00Z'));
    const clock = createClock();
    const listener = vi.fn();
    clock.subscribe(listener);

    vi.setSystemTime(new Date('2027-01-22T10:03:00Z'));
    clock.tick();

    expect(clock.get()).toBe(Date.parse('2027-01-22T10:03:00Z'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('時刻が変わっていなければ知らせない', () => {
    vi.useFakeTimers();
    const clock = createClock();
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.tick();

    expect(listener).not.toHaveBeenCalled();
  });

  test('受け取りをやめたら知らせない', () => {
    vi.useFakeTimers();
    const clock = createClock();
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    unsubscribe();

    vi.setSystemTime(Date.now() + 60_000);
    clock.tick();

    expect(listener).not.toHaveBeenCalled();
  });
});
