import { describe, expect, test } from 'vitest';
import { verifyPasscode } from '@/server/session';

/**
 * 合言葉の照合。
 * .env.test の TOURNAMENT_PASSCODE=test-passcode を前提にしている。
 */
describe('合言葉の照合', () => {
  test('正しい合言葉は通る', () => {
    expect(verifyPasscode('test-passcode')).toBe(true);
  });

  test('前後の空白は無視する（コピペや予測変換で入りがち）', () => {
    expect(verifyPasscode('  test-passcode  ')).toBe(true);
  });

  test('違う合言葉は弾く', () => {
    expect(verifyPasscode('wrong')).toBe(false);
  });

  test('空文字は弾く', () => {
    expect(verifyPasscode('')).toBe(false);
  });

  test('大文字小文字は区別する', () => {
    expect(verifyPasscode('TEST-PASSCODE')).toBe(false);
  });
});
