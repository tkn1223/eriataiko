import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/db/server';

/**
 * 「いまの大会」（`is_current` が true の 1 件）。無ければ null。読み取りだけ。
 *
 * **1 回のリクエストの中で何度呼んでも、読みに行くのは 1 回だけ**（React の `cache`）。
 * ヘッダー（`src/app/(app)/layout.tsx`）と各ページの両方から呼ばれるので、
 * 素直に書くと 1 画面で 2 回読むことになる。体育館の電波は細い。
 */
export const findCurrentCompetition = cache(
  async (): Promise<{ id: string; name: string } | null> => {
    const { data, error } = await createSupabaseServerClient()
      .from('competitions')
      .select('id, name')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }
);
