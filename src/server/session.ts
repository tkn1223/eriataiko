import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { serverEnv } from '@/config/env.server';

/**
 * 「入場」セッション。
 *
 * ID / パスワードは使わない。大会共通の合言葉を 1 回通したうえで
 * 一覧から自分を選ぶと、署名付き httpOnly Cookie が発行される。
 * この Cookie はサーバーの秘密鍵で署名されているので、
 * ブラウザ側で中身を書き換えて別人になりすますことはできない。
 */

const COOKIE_NAME = 'eriataiko_session';
/** 大会は 1 日運用。翌朝の設営から夜の片付けまでを想定して 16 時間。 */
const MAX_AGE_SECONDS = 60 * 60 * 16;

/**
 * いま操作している人。
 *
 * 名前の "Operator" は**役割**（この端末を操作している人）を指す。
 * かつて同名の表があったが、名簿は players / entries に一本化して消した
 * （docs/specs/2026-08-21-drop-operators.md）。
 *
 * `canInput` は入場したときの値を焼き付けている。当日に入力権限を外しても
 * その端末では 16 時間効かないが、そこまで厳密に管理するアプリではない。
 */
export type OperatorSession = {
  playerId: string;
  playerName: string;
  /** 同名（「たろう」が複数いる）を画面で見分けるための番号 */
  playerNumber: number;
  /** 得点を入力してよい人か */
  canInput: boolean;
};

function secretKey() {
  return new TextEncoder().encode(serverEnv().SESSION_SECRET);
}

/**
 * 合言葉の照合。
 *
 * 長さの差から中身が漏れないよう、ハッシュ化してから定数時間で比較する。
 *
 * **日本語の合言葉のために NFC で正規化している。** 「がんばれ」の「が」は
 * 1 文字として持つ形と「か」＋濁点の 2 文字で持つ形があり、見た目が同じでも
 * 別のバイト列になる。端末や入力方法によってどちらで届くかが変わるので、
 * 正規化しないと**正しい合言葉を入れたのに弾かれる**（実測で確認）。
 */
export function verifyPasscode(input: string) {
  const expected = serverEnv().TOURNAMENT_PASSCODE;
  if (expected.length === 0) return true; // 合言葉なし運用
  const a = createHash('sha256').update(normalize(input)).digest();
  const b = createHash('sha256').update(normalize(expected)).digest();
  return timingSafeEqual(a, b);
}

/** 前後の空白を落とし、文字の表し方を 1 通りに揃える */
function normalize(value: string) {
  return value.trim().normalize('NFC');
}

export async function createSession(session: OperatorSession) {
  const token = await new SignJWT({
    name: session.playerName,
    number: session.playerNumber,
    canInput: session.canInput,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.playerId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<OperatorSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.name !== 'string') return null;
    if (typeof payload.number !== 'number') return null;
    return {
      playerId: payload.sub,
      playerName: payload.name,
      playerNumber: payload.number,
      canInput: payload.canInput === true,
    };
  } catch {
    // 期限切れ・改ざん・鍵の入れ替え
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}
