import 'server-only';

import { z } from 'zod';
import { parseEnv } from '@/config/env';

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

  // ここから下 4 つは大会当日だけ動く「スプレッドシートへのバックアップ」用（docs/backup.md）。
  // 開発中は Google の実物に繋がないため、他の値と違って未設定でもビルド・テストを通す
  // 必要があり、TOURNAMENT_PASSCODE と同じく空文字をデフォルトにしてある。
  // 実際に使うとき（src/app/api/backup/route.ts）は、空ならその場で日本語のエラーにする。

  // このバックアップ API を叩くための秘密のヘッダー値。GitHub Actions の secrets.BACKUP_SECRET と同じ値。
  BACKUP_SECRET: z.string().default(''),
  // サービスアカウントのメールアドレス（Google Cloud で発行した JSON の client_email）。
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().default(''),
  // サービスアカウントの秘密鍵（同じ JSON の private_key）。
  GOOGLE_PRIVATE_KEY: z.string().default(''),
  // バックアップ先のスプレッドシート ID（URL の /d/ と /edit の間の文字列）。
  // 名前は Vercel に登録済みのものに合わせている（docs/backup.md）。
  BACKUP_SPREADSHEET_ID: z.string().default(''),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (!cached) {
    // スキーマに足した変数は、必ずここにも書き足すこと。
    // 書き忘れると（未設定ではなく）常に既定値になり、本番でだけ静かに動かなくなる。
    cached = parseEnv(serverSchema, {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SESSION_SECRET: process.env.SESSION_SECRET,
      TOURNAMENT_PASSCODE: process.env.TOURNAMENT_PASSCODE ?? '',
      BACKUP_SECRET: process.env.BACKUP_SECRET ?? '',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ?? '',
      BACKUP_SPREADSHEET_ID: process.env.BACKUP_SPREADSHEET_ID ?? '',
    });
  }
  return cached;
}

/** 合言葉が設定されているか（入場画面で入力欄を出すかの判定に使う）。 */
export function isPasscodeRequired() {
  return serverEnv().TOURNAMENT_PASSCODE.length > 0;
}
