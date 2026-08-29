import 'server-only';

import { z } from 'zod';
import { getSupabaseAdminClient } from '@/db/admin';
import type { GameScore } from '@/domain/scoring';
import type { FinishMatchRepository } from '@/usecases/finish-match';
import type { ReopenMatchRepository } from '@/usecases/reopen-match';
import type { SaveScoreRepository } from '@/usecases/save-score';

const matchIdSchema = z.uuid();

/**
 * `matches` / `game_scores` を触る、得点入力まわりの usecases 向け実装。
 *
 * `getSupabaseAdminClient()` を使うので、呼び出しは Route Handler の中に限る
 * （AGENTS.md の「破ってはいけない 3 つ」の 2 番目）。
 *
 * 3 つの usecase（save-score / finish-match / reopen-match）が求める
 * インターフェースをまとめて満たす 1 つのオブジェクトにしている。
 * `findMatch` の戻り値は一番情報の多い形（max_game_count 込み）にそろえ、
 * 各 usecase は自分が使う分だけを読む。
 */
export const matchesDb: SaveScoreRepository & FinishMatchRepository & ReopenMatchRepository = {
  async findMatch(matchId) {
    // URL に uuid でない文字列が入ってくると Postgres が構文エラーを返し、
    // 「無い試合」なのに 500 になってしまう。存在しないのは同じなので null に寄せる。
    if (!matchIdSchema.safeParse(matchId).success) return null;

    const { data, error } = await getSupabaseAdminClient()
      .from('matches')
      .select('id, status, max_game_count')
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return { id: data.id, status: data.status, maxGameCount: data.max_game_count };
  },

  async saveGameScore({ matchId, gameNumber, sideAScore, sideBScore, now }) {
    // upsert 1 回で「無ければ作る、あれば書き換える」が済む。
    // unique (match_id, game_number) があるので行が増える心配は無い。
    // updated_at は自分で入れる（この DB に自動更新の仕掛けは無い）。
    const { error } = await getSupabaseAdminClient().from('game_scores').upsert(
      {
        match_id: matchId,
        game_number: gameNumber,
        side_a_score: sideAScore,
        side_b_score: sideBScore,
        updated_at: now.toISOString(),
      },
      { onConflict: 'match_id,game_number' }
    );
    if (error) throw error;
  },

  async markLive({ matchId, startedAt }) {
    const { error } = await getSupabaseAdminClient()
      .from('matches')
      .update({ status: 'live', started_at: startedAt.toISOString() })
      .eq('id', matchId);
    if (error) throw error;
  },

  async findGameScores(matchId): Promise<GameScore[]> {
    // 1 試合の最大ゲーム数（matches.max_game_count）は現実的に片手で足りる件数なので、
    // 余裕を持った上限を付けておく（AGENTS.md の「一覧を読むクエリには .limit() を付ける」）。
    const MAX_GAMES_PER_MATCH = 50;
    const { data, error } = await getSupabaseAdminClient()
      .from('game_scores')
      .select('game_number, side_a_score, side_b_score')
      .eq('match_id', matchId)
      .limit(MAX_GAMES_PER_MATCH);
    if (error) throw error;

    return (data ?? []).map((row) => ({
      gameNumber: row.game_number,
      sideAScore: row.side_a_score,
      sideBScore: row.side_b_score,
    }));
  },

  async finish({ matchId, finishedAt }) {
    const { error } = await getSupabaseAdminClient()
      .from('matches')
      .update({ status: 'done', finished_at: finishedAt.toISOString() })
      .eq('id', matchId);
    if (error) throw error;
  },

  async reopen({ matchId }) {
    const { error } = await getSupabaseAdminClient()
      .from('matches')
      .update({ status: 'live', finished_at: null })
      .eq('id', matchId);
    if (error) throw error;
  },
};
