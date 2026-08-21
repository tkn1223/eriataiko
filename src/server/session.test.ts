import { describe, expect, test } from 'vitest';
import { verifyPasscode } from '@/server/session';

/**
 * 合言葉の照合。
 * .env.test の TOURNAMENT_PASSCODE=がんばれ2027 を前提にしている。
 *
 * **わざと日本語（濁点あり）にしている。** 濁点は「が」1 文字で持つ形と
 * 「か」＋濁点の 2 文字で持つ形があり、見た目が同じでも別のバイト列になる。
 * 端末や入力方法でどちらが届くか変わるので、ここが崩れると当日
 * 「正しい合言葉なのに入れない」が起きる。
 */
const PASSCODE = 'がんばれ2027';

describe('合言葉の照合', () => {
  test('正しい合言葉は通る', () => {
    expect(verifyPasscode(PASSCODE)).toBe(true);
  });

  test('前後の空白は無視する（コピペや予測変換で入りがち）', () => {
    expect(verifyPasscode(`  ${PASSCODE}  `)).toBe(true);
  });

  test('濁点の表し方が違っても通る（端末によって届き方が変わる）', () => {
    const nfd = PASSCODE.normalize('NFD');
    // 見た目は同じでも、文字列としては別物
    expect(nfd).not.toBe(PASSCODE);
    expect(verifyPasscode(nfd)).toBe(true);
  });

  test('違う合言葉は弾く', () => {
    expect(verifyPasscode('ちがう合言葉')).toBe(false);
  });

  test('空文字は弾く', () => {
    expect(verifyPasscode('')).toBe(false);
  });

  test('大文字小文字は区別する', () => {
    expect(verifyPasscode('TEST-PASSCODE')).toBe(false);
  });
});
