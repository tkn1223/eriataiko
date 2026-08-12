import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Server Component / Route Handler から使う anon クライアント。読み取り専用。
 *
 * 公開データの初期表示（SSR）に使う。ブラウザ側と同じ RLS が効くので、
 * ここで見えるものは観戦者にも見えると考えてよい。
 */
export function createSupabaseServerClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
