import 'server-only';

import { z } from 'zod';
import { getSupabaseAdminClient } from '@/db/admin';
import type { GameScore } from '@/domain/scoring';
import { scorerLabel } from '@/domain/scorer';
import type { ClaimScorerRepository } from '@/usecases/claim-scorer';
import type { FinishMatchRepository } from '@/usecases/finish-match';
import type { MatchScorer } from '@/usecases/match-scorer';
import type { ReleaseScorerRepository } from '@/usecases/release-scorer';
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
 * 5 つの usecase（save-score / finish-match / reopen-match / claim-scorer / release-scorer）が
 * 求めるインターフェースをまとめて満たす 1 つのオブジェクトにしている。
 * `findMatch` の戻り値は一番情報の多い形（max_game_count・いまの担当込み）にそろえ、
 * 各 usecase は自分が使う分だけを読む。
 */
export const matchesDb: SaveScoreRepository &
  FinishMatchRepository &
  ReopenMatchRepository &
  ClaimScorerRepository &
  ReleaseScorerRepository = {
  async findMatch(matchId) {
    // URL に uuid でない文字列が入ってくると Postgres が構文エラーを返し、
    // 「無い試合」なのに 500 になってしまう。存在しないのは同じなので null に寄せる。
    if (!matchIdSchema.safeParse(matchId).success) return null;

    const { data, error } = await getSupabaseAdminClient()
      .from('matches')
      .select(
        `id, status, max_game_count, scorer_last_scored_at,
        scorer:participants!matches_scorer_participant_id_fkey(
          id, player_id, players!inner(name), teams(name)
        )`
      )
      .eq('id', matchId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // 担当の参加者がいても時刻が無い行は作らない（入口は必ず一緒に書く）。万一あれば担当なし扱い
    const scorer: MatchScorer | null =
      data.scorer && data.scorer_last_scored_at
        ? {
            participantId: data.scorer.id,
            playerId: data.scorer.player_id,
            label: scorerLabel({
              teamName: data.scorer.teams?.name ?? null,
              playerName: data.scorer.players.name,
            }),
            lastScoredAt: new Date(data.scorer_last_scored_at),
          }
        : null;

    return { id: data.id, status: data.status, maxGameCount: data.max_game_count, scorer };
  },

  async findParticipantOfPlayer({ matchId, playerId }) {
    if (!matchIdSchema.safeParse(matchId).success) return null;

    const supabase = getSupabaseAdminClient();
    // 試合は部を通して大会に属する（matches 自身は大会の id を持たない）
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('divisions!inner(competition_id)')
      .eq('id', matchId)
      .maybeSingle();
    if (matchError) throw matchError;
    if (!match) return null;

    const { data, error } = await supabase
      .from('participants')
      .select('id')
      .eq('competition_id', match.divisions.competition_id)
      .eq('player_id', playerId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  },

  async setScorer({ matchId, participantId, expectedHolderParticipantId, now }) {
    const update = getSupabaseAdminClient()
      .from('matches')
      .update({
        scorer_participant_id: participantId,
        scorer_last_scored_at: now.toISOString(),
      })
      .eq('id', matchId);
    // 読んだときの担当のままのときだけ書く。条件に合う行が無ければ何も書かれず、返る行が 0 件になる
    const { data, error } = await (
      expectedHolderParticipantId === null
        ? update.is('scorer_participant_id', null)
        : update.eq('scorer_participant_id', expectedHolderParticipantId)
    ).select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async clearScorer({ matchId, expectedHolderParticipantId }) {
    const { data, error } = await getSupabaseAdminClient()
      .from('matches')
      .update({ scorer_participant_id: null, scorer_last_scored_at: null })
      .eq('id', matchId)
      .eq('scorer_participant_id', expectedHolderParticipantId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
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

  async finish({ matchId, finishedAt, ending }) {
    const { error } = await getSupabaseAdminClient()
      .from('matches')
      .update({ status: 'done', finished_at: finishedAt.toISOString(), ending })
      .eq('id', matchId);
    if (error) throw error;
  },

  async reopen({ matchId, scorerParticipantId, now }) {
    const { error } = await getSupabaseAdminClient()
      .from('matches')
      .update({
        status: 'live',
        finished_at: null,
        ending: 'normal',
        // 直す人が担当になる。状態と同じ書き込みにして、全員の画面に 1 回の変化で届ける
        scorer_participant_id: scorerParticipantId,
        scorer_last_scored_at: now.toISOString(),
      })
      .eq('id', matchId);
    if (error) throw error;
  },
};
