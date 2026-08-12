'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from '@/config/env';
import type { Database } from '@/types/database';

/**
 * ブラウザから使う anon クライアント。**読み取りと Realtime 購読専用**。
 *
 * このクライアントで INSERT / UPDATE / DELETE を書いても RLS に弾かれる（設計どおり）。
 * 書き込みは必ず `/api/**` の Route Handler 経由にすること。
 */
let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createClient<Database>(
      publicEnv().NEXT_PUBLIC_SUPABASE_URL,
      publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          // Supabase Auth は使わない（入場は独自の署名 Cookie）
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          // 1 秒あたりのイベント数上限。得点更新程度なら十分。
          params: { eventsPerSecond: 10 },
        },
      }
    );
  }
  return browserClient;
}
