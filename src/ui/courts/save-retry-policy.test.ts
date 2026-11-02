import { describe, expect, test } from 'vitest';
import {
  DEFAULT_REJECTED_MESSAGE,
  rejectionKind,
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

describe('担当でないと断られたとき（docs/specs/2026-10-14-match-scorer.md の ⑧）', () => {
  const notScorer: SendResult = {
    ok: false,
    kind: 'http',
    status: 409,
    message: '愛知北のじろうさんが担当しています。',
    code: 'not-scorer',
  };

  test('送り直さない（送り直しても、いまの担当の点を上書きするだけになるため）', () => {
    expect(shouldRetry(notScorer)).toBe(false);
  });

  test('理由は入口の日本語（いまの担当の名前つき）をそのまま出す', () => {
    expect(rejectionMessage(notScorer as Extract<SendResult, { kind: 'http' }>)).toBe(
      '愛知北のじろうさんが担当しています。'
    );
  });

  test('同じ 409 でも、code が not-scorer なら「担当でない」と見分けられる', () => {
    expect(rejectionKind(notScorer)).toBe('not-scorer');
  });

  test('終了した試合の 409（code なし）は「担当でない」ではなく、ふつうの断られ方', () => {
    expect(
      rejectionKind({
        ok: false,
        kind: 'http',
        status: 409,
        message: '終了した試合です。',
      })
    ).toBe('other');
  });

  test('担当を取るのを、ほかの人が入力中で断られたときは scorer-active', () => {
    expect(
      rejectionKind({
        ok: false,
        kind: 'http',
        status: 409,
        message: '愛知北のじろうさんが入力しています。',
        code: 'scorer-active',
      })
    ).toBe('scorer-active');
  });

  test('つながらない・5xx は断られではないので other', () => {
    expect(rejectionKind({ ok: false, kind: 'network' })).toBe('other');
    expect(rejectionKind({ ok: false, kind: 'http', status: 500, message: null })).toBe('other');
  });
});
