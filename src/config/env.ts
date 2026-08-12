import { z } from 'zod';

/**
 * ブラウザにも渡る環境変数。**ここに秘密の値を足さないこと。**
 * NEXT_PUBLIC_* は JS バンドルに焼き込まれるので、誰でも読める。
 *
 * サーバー専用の値は env.server.ts へ。
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    message: 'https://xxxx.supabase.co の形式で設定してください',
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { message: '未設定です' }),
});

let cached: z.infer<typeof publicSchema> | null = null;

/**
 * 遅延評価にしてある。環境変数なしでも `next build` は通り、
 * 実際にアクセスされたときだけ落ちる（Vercel の初回デプロイやプレビューで詰まらないように）。
 */
export function publicEnv() {
  if (!cached) {
    // NEXT_PUBLIC_* は静的に参照しないとビルド時に値が埋め込まれないため、
    // process.env をまるごと渡さずプロパティを明示的に書き出す。
    cached = parseEnv(publicSchema, {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return cached;
}

/** zod の生エラーではなく「どの変数をどう直すか」が分かる形で投げる。 */
export function parseEnv<T extends z.ZodObject>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`環境変数の設定が足りません。\n${detail}\n\n.env.example を参照してください。`);
  }
  return result.data;
}
