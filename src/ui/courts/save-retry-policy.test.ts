import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REJECTED_MESSAGE,
  rejectionMessage,
  retryDelayMs,
  shouldRetry,
  type SendResult,
} from '@/ui/courts/save-retry-policy';

describe('shouldRetry', () => {
  test('つながらない（network）ときは送り直す', () => {
    expect(shouldRetry({ ok: false, kind: 'network' })).toBe(true);
  });

  test('サーバーの一時的な失敗（500）は送り直す', () => {
    expect(shouldRetry({ ok: false, kind: 'http', status: 500, message: null })).toBe(true);
  });

  test('503 も送り直す', () => {
    expect(shouldRetry({ ok: false, kind: 'http', status: 503, message: null })).toBe(true);
  });

  test('429（混雑）は送り直す', () => {
    expect(shouldRetry({ ok: false, kind: 'http', status: 429, message: null })).toBe(true);
  });

  test.each([400, 401, 403, 404, 409])('%i は送り直さない', (status) => {
    expect(shouldRetry({ ok: false, kind: 'http', status, message: '理由' })).toBe(false);
  });
});

describe('retryDelayMs', () => {
  test('1 回目の失敗は 1 秒後', () => {
    expect(retryDelayMs(1)).toBe(1000);
  });

  test('2 回目の失敗は 2 秒後', () => {
    expect(retryDelayMs(2)).toBe(2000);
  });

  test('3 回目の失敗は 4 秒後', () => {
    expect(retryDelayMs(3)).toBe(4000);
  });

  test('4 回目の失敗は 8 秒後', () => {
    expect(retryDelayMs(4)).toBe(8000);
  });

  test('5 回目以降の失敗は 10 秒（頭打ち）', () => {
    expect(retryDelayMs(5)).toBe(10000);
    expect(retryDelayMs(6)).toBe(10000);
    expect(retryDelayMs(100)).toBe(10000);
  });
});

describe('rejectionMessage', () => {
  test('応答の理由をそのまま返す', () => {
    const result: SendResult = {
      ok: false,
      kind: 'http',
      status: 409,
      message: '終了した試合です。先に「終了を取り消す」を押してください。',
    };
    expect(rejectionMessage(result)).toBe(
      '終了した試合です。先に「終了を取り消す」を押してください。'
    );
  });

  test('理由が取れなければ既定の日本語を返す', () => {
    expect(rejectionMessage({ ok: false, kind: 'http', status: 404, message: null })).toBe(
      DEFAULT_REJECTED_MESSAGE
    );
  });
});
