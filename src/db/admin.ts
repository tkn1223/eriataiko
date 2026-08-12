import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/config/env';
import { serverEnv } from '@/config/env.server';
import type { Database } from '@/types/database';

/**
 * service_role クライアント。**RLS を完全に無視する**。
 *
 * 使ってよいのは Route Handler の中だけ。しかも「誰が書いたか」を
 * `requireOperator()` で確かめた後に限る（src/lib/session.ts）。
 * Server Component から呼ぶと、うっかり公開ページに秘密のデータを
 * 載せてしまうので使わない。
 */
let adminClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    adminClient = createClient<Database>(
      publicEnv().NEXT_PUBLIC_SUPABASE_URL,
      serverEnv().SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return adminClient;
}
