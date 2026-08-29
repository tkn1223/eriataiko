import 'server-only';

import { z } from 'zod';
import { getSupabaseAdminClient } from '@/db/admin';
import type { GameScore } from '@/domain/scoring';
import type { FinishMatchRepository } from '@/usecases/finish-match';
import type { ReopenMatchRepository } from '@/usecases/reopen-match';
import type { SaveScoreRepository } from '@/usecases/save-score';

const matchIdSchema = z.uuid();

/** Postgres の「すでに同じものがあります」。unique (match_id, game_number) に引っかかると返る。 */
const UNIQUE_VIOLATION = '23505';

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
    const supabase = getSupabaseAdminClient();
    const scores = {
      side_a_score: sideAScore,
      side_b_score: sideBScore,
      // この DB に自動更新の仕掛けは無いので、書き換えるたびに自分で入れる
      updated_at: now.toISOString(),
    };

    const updateScores = async () => {
      const { error } = await supabase
        .from('game_scores')
        .update(scores)
        .eq('match_id', matchId)
        .eq('game_number', gameNumber);
      if (error) throw error;
    };

    const { data: existing, error: findError } = await supabase
      .from('game_scores')
      .select('id')
      .eq('match_id', matchId)
      .eq('game_number', gameNumber)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      await updateScores();
      return;
    }

    const { error } = await supabase
      .from('game_scores')
      .insert({ match_id: matchId, game_number: gameNumber, ...scores });
    if (!error) return;

    // 得点係が 2 台で開いていると、まだ行の無いゲームに同時に届くことがある。
    // 先に届いた側が行を作り、こちらは重複で弾かれる。落とさずに書き換えへ回す。
    // （そのまま throw すると得点係には「サーバー側でエラー」と出て、1 点消える）
    if (error.code !== UNIQUE_VIOLATION) throw error;
    await updateScores();
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
