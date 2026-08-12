import 'server-only';

import { z } from 'zod';
import { parseEnv } from '@/lib/env';

/** サーバーにしか存在しない環境変数。クライアントから import するとビルドエラーになる。 */
const serverSchema = z.object({
  // Supabase の service_role（新方式なら secret key）。RLS を無視できる鍵なので
  // 絶対にクライアントへ渡さない。書き込み系 Route Handler からのみ使う。
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { message: '未設定です' }),
  // セッション Cookie の署名鍵。`openssl rand -base64 32` で生成する。
  SESSION_SECRET: z.string().min(32, {
    message: '32 文字以上にしてください（openssl rand -base64 32）',
  }),
  // 大会共通の合言葉。空文字なら合言葉チェックなしで入場できる（身内テスト用）。
  TOURNAMENT_PASSCODE: z.string().default(''),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (!cached) {
    cached = parseEnv(serverSchema, {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SESSION_SECRET: process.env.SESSION_SECRET,
      TOURNAMENT_PASSCODE: process.env.TOURNAMENT_PASSCODE ?? '',
    });
  }
  return cached;
}

/** 合言葉が設定されているか（入場画面で入力欄を出すかの判定に使う）。 */
export function isPasscodeRequired() {
  return serverEnv().TOURNAMENT_PASSCODE.length > 0;
}
