import { ApiError } from '@/server/route-helpers';
import { hasAnyPoint } from '@/domain/scoring';
import {
  secureScorerForScoring,
  type MatchScorer,
  type ScorerWriteRepository,
} from '@/usecases/match-scorer';

/** `saveScore` が判断に使う、試合の必要最小限の情報。 */
export type MatchForScoring = {
  id: string;
  /** 'waiting' | 'live' | 'done'（DB の check 制約で保証されている）。 */
  status: string;
  maxGameCount: number;
  /** いまの担当。いなければ null。 */
  scorer: MatchScorer | null;
};

/** `saveScore` が DB に求める操作の約束。実装は `src/db/matches.ts`。 */
export type SaveScoreRepository = Pick<
  ScorerWriteRepository,
  'findParticipantOfPlayer' | 'setScorer'
> & {
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
  /** 点を送ってきた人（入場している人の `players.id`）。担当かどうかの確かめに使う。 */
  playerId: string;
  /** テストで時刻を固定できるよう、呼び出し側（Route Handler）から渡す。 */
  now: Date;
};

export type SaveScoreResult = {
  /** 担当がいなかった（外れていた）ので、送ってきた人が担当になった。記録 `scorer.claim` の元。 */
  scorerClaimed: boolean;
};

/**
 * 得点を保存する（今の点数をそのまま送る方式。「1 点足す」ではない）。
 *
 * **担当でない人の点は保存しない**（いまの担当の点を上書きしない）。担当がいない（または 5 分たって
 * 外れた）試合に点が届いたら、送ってきた人を担当にして保存する。担当を取る操作が電波で失敗していても
 * 点は止めないため（`src/usecases/match-scorer.ts`）。
 *
 * 仕様: docs/specs/2026-08-29-score-input-backend.md
 *       docs/specs/2026-10-14-match-scorer.md
 */
export async function saveScore(
  deps: SaveScoreRepository,
  input: SaveScoreInput
): Promise<SaveScoreResult> {
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

  // 点を書く前に担当を確かめる（担当でなければここで断り、何も書かない）
  const { claimed } = await secureScorerForScoring(deps, {
    matchId: input.matchId,
    scorer: match.scorer,
    playerId: input.playerId,
    now: input.now,
  });

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

  return { scorerClaimed: claimed };
}
