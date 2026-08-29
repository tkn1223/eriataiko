import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint } from '@/domain/scoring';

/** `saveScore` が判断に使う、試合の必要最小限の情報。 */
export type MatchForScoring = {
  id: string;
  /** 'waiting' | 'live' | 'done'（DB の check 制約で保証されている）。 */
  status: string;
  maxGameCount: number;
};

/** `saveScore` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type SaveScoreRepository = {
  findMatch(matchId: string): Promise<MatchForScoring | null>;
  /**
   * `match_id` × `game_number` の行に得点を書く。
   * 無ければ作り、あれば書き換える（どちらになるかは実装側の判断）。
   */
  saveGameScore(input: {
    matchId: string;
    gameNumber: number;
    sideAScore: number;
    sideBScore: number;
    now: Date;
  }): Promise<void>;
  /** `matches` を live にし、started_at を入れる。 */
  markLive(input: { matchId: string; startedAt: Date }): Promise<void>;
};

export type SaveScoreInput = {
  matchId: string;
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
  /** テストで時刻を固定できるよう、呼び出し側（Route Handler）から渡す。 */
  now: Date;
};

/**
 * 得点を保存する（今の点数をそのまま送る方式。「1 点足す」ではない）。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 */
export async function saveScore(deps: SaveScoreRepository, input: SaveScoreInput): Promise<void> {
  const match = await deps.findMatch(input.matchId);
  if (!match) {
    throw new ApiError(404, 'その試合は見つかりませんでした。画面を更新してください。');
  }
  if (match.status === 'done') {
    throw new ApiError(409, '終了した試合です。先に「終了を取り消す」を押してください。');
  }
  if (input.gameNumber < 1) {
    throw new ApiError(400, 'ゲーム番号は 1 以上で送ってください。');
  }
  // 当日 max_game_count を減らすと、開いたままの画面から余分なゲームが届く。
  // 「何ゲームまでか」を出して、画面を開き直せば直ると分かるようにする。
  if (input.gameNumber > match.maxGameCount) {
    throw new ApiError(
      400,
      `この試合は第 ${match.maxGameCount} ゲームまでです。画面を更新してからやり直してください。`
    );
  }

  await deps.saveGameScore({
    matchId: input.matchId,
    gameNumber: input.gameNumber,
    sideAScore: input.sideAScore,
    sideBScore: input.sideBScore,
    now: input.now,
  });

  // waiting のまま何点も送られてくるのは普通なので、live に上げるのは
  // 「まだ waiting」で「かつ今回 1 点でも入った」ときだけに絞る。
  const scoreJustSaved = [
    { gameNumber: input.gameNumber, sideAScore: input.sideAScore, sideBScore: input.sideBScore },
  ];
  if (match.status === 'waiting' && hasAnyPoint(scoreJustSaved)) {
    await deps.markLive({ matchId: input.matchId, startedAt: input.now });
  }
}
