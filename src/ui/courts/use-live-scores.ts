'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/db/client';

/** `game_scores` の 1 行ぶんの変化。Realtime が届けてくる中身をそのまま渡す形。 */
export type GameScoreChange = {
  matchId: string;
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

/**
 * いま Realtime につながっているか。
 *
 * 切れたときに黙って古い数字を見せ続けるのはうそになるので、
 * つながっていないことを画面の帯で伝える（AGENTS.md「エラーは必ず日本語で画面に出す」）。
 * **取りこぼしを自動で埋める複雑な復帰処理はしない。** 人に画面を更新してもらう。
 */
export type ConnectionStatus = 'connected' | 'disconnected';

type Params = {
  /**
   * `game_scores` が変わったときに呼ばれる。**読み直さず、届いた値をそのまま渡す。**
   *
   * 1 点入るたびに見ている全員がコート 8 面ぶんを読み直すと通信量が無料枠を
   * 1 日で使い切る計算になった（3,500 回 × 100 人 × 6〜15KB ≈ 2〜5GB／月 5GB）。
   * Supabase の Realtime は変更後の行をそのまま届けるので、読み直す必要が無い。
   */
  onGameScoreChange: (change: GameScoreChange) => void;
};

/** postgres_changes が payload.new / payload.old に積んでくる、行の生の値。 */
type RawGameScoreRow = {
  match_id: string;
  game_number: number;
  side_a_score: number;
  side_b_score: number;
};

/**
 * 他の人の得点をその場で映す購読。
 *
 * - `game_scores` の変化 → 上の理由で、届いた値をそのまま `onGameScoreChange` に渡す（読み直さない）。
 * - `matches` の変化（waiting → live など） → 1 行では「試合の入れ替わり」まで表せないので
 *   `router.refresh()` で読み直す。0.5 秒ぶんをまとめて 1 回にする。
 *   こちらは 1 日 96 回程度（コートの数 × 試合数）なので通信量への影響は小さい。
 * - つながっているかどうか（`connectionStatus`）を返す。切れたら呼び出し側が帯を出す。
 *   **切れたときに取りこぼしを自動で埋める処理はしない。**
 *   人に「画面を更新してください」と伝えるほうが、黙って古い数字を見せ続けるより正直で単純。
 */
export function useLiveScores({ onGameScoreChange }: Params): {
  connectionStatus: ConnectionStatus;
} {
  // render 中に ref へ書き込まない（react-hooks/refs）。呼び出し側で毎回新しい関数を
  // 渡してきても、購読を張り直さずに済むよう effect の中で最新の関数へ揃える。
  const onGameScoreChangeRef = useRef(onGameScoreChange);
  useEffect(() => {
    onGameScoreChangeRef.current = onGameScoreChange;
  });
  const router = useRouter();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');

  useEffect(() => {
    let disposed = false;
    const supabase = getSupabaseBrowserClient();
    let matchesTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleMatchesRefresh() {
      if (matchesTimer) return;
      matchesTimer = setTimeout(() => {
        matchesTimer = null;
        router.refresh();
      }, 500);
    }

    const channel = supabase
      .channel('courts-live-scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_scores' }, (payload) => {
        const row = (payload.new ?? payload.old) as RawGameScoreRow | null;
        if (!row) return;
        onGameScoreChangeRef.current({
          matchId: row.match_id,
          gameNumber: row.game_number,
          sideAScore: row.side_a_score,
          sideBScore: row.side_b_score,
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () =>
        scheduleMatchesRefresh()
      )
      .subscribe((status) => {
        if (disposed) return;
        // SUBSCRIBED 以外（TIMED_OUT / CLOSED / CHANNEL_ERROR）はどれも「いま繋がっていない」。
        setConnectionStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
      });

    return () => {
      disposed = true;
      if (matchesTimer) clearTimeout(matchesTimer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return { connectionStatus };
}
