import type { GameScore } from '@/domain/scoring';
import type { CourtMatch, CourtMatchStatus, MatchSyncState } from '@/ui/courts/types';

/**
 * 他の人の点や試合の状態の変化（Supabase から届いた 1 行）を、画面が持つ試合の一覧に当てる判断。
 * 通信も画面も触らない純粋な関数。
 *
 * **届いた行だけを当てる。** 点が変わるたびに画面全体を読み直すと、見ている全員が
 * 1 点ごとにコート全部ぶんを取り直す（docs/roadmap.md の 1 の通信量の注意）。
 * 手元に無い試合の変化だけは当てる先が無いので、`needsRefresh` で「読み直して」と返す。
 *
 * 進行表（`src/ui/matches/use-live-matches.ts`）も同じ判断を使う（同じ試合が 2 つの画面で違って
 * 見えないように）。進行表は点を入れないので、手元の点（`pendingByMatchId`）は空で渡す。
 * 置き場所が `courts/` なのは、結果LIVE で先に作ったため。
 *
 * 仕様: docs/specs/2026-10-09-courts-live-and-finish.md（進行表: docs/specs/2026-10-14-matches-real-data.md）
 */

export type LiveChange =
  /** `matches` の UPDATE。状態・コート・順番・終了の時刻が変わった。 */
  | {
      kind: 'match';
      matchId: string;
      status: CourtMatchStatus;
      courtNumber: number | null;
      orderInCourt: number | null;
      finishedAt: string | null;
      maxGameCount: number;
      /** `matches.ending`（棄権の印）。 */
      ending: string;
      /** `matches.scorer_participant_id`。いまの入力担当（参加者）。いなければ null。 */
      scorerParticipantId: string | null;
      /** `matches.scorer_claimed_at`。担当になった時刻。 */
      scorerClaimedAt: string | null;
    }
  /** `game_scores` の INSERT / UPDATE。ある試合のあるゲームの点が変わった。 */
  | {
      kind: 'score';
      matchId: string;
      gameNumber: number;
      sideAScore: number;
      sideBScore: number;
      /** `game_scores.updated_at`。点が保存された時刻（担当の「最後に点を入れた時刻」に使う）。無い古い形は null。 */
      savedAt: string | null;
    };

export type LiveChangeResult = {
  /** 当てたあとの一覧。何も変わらなければ受け取ったものと同じ参照を返す。 */
  board: CourtMatch[];
  /** 手元に無い試合の変化だった。呼び出し側が 1 回だけ読み直す。 */
  needsRefresh: boolean;
};

/** 預かり場所の中身のうち、ここで見る部分（届いた点より優先する手元の点）だけ。 */
type PendingByMatchId = Record<string, Pick<MatchSyncState, 'pendingScores'>>;

function applyScore(
  board: CourtMatch[],
  change: Extract<LiveChange, { kind: 'score' }>,
  pendingByMatchId: PendingByMatchId
): LiveChangeResult {
  const found = board.find((match) => match.matchId === change.matchId);
  if (!found) return { board, needsRefresh: true };

  // 点が保存された時刻（担当が 5 分で外れるかの元）は、点数を当てない場合も当てる。
  // 同じ点数のまま時刻だけ新しくなることもある（同じ点を送り直した）
  const savedAtChanged =
    change.savedAt !== null && found.scoreSavedAtByGame[change.gameNumber] !== change.savedAt;
  const target: CourtMatch = savedAtChanged
    ? {
        ...found,
        scoreSavedAtByGame: { ...found.scoreSavedAtByGame, [change.gameNumber]: change.savedAt! },
      }
    : found;
  const unchangedScores = {
    board: savedAtChanged ? board.map((match) => (match === found ? target : match)) : board,
    needsRefresh: false,
  };

  // 手元で押して、まだサーバーに届いていない・届いたが購読でまだ戻ってきていない点は、
  // 届いた点より優先する。届いたのは自分の少し前の点や、他の人の古い点かもしれない。
  // 上書きすると押した点が消えて見え、そこで押すと 1 点ぶん数えそこねる。
  const pending = pendingByMatchId[change.matchId]?.pendingScores ?? [];
  if (pending.some((score) => score.gameNumber === change.gameNumber)) return unchangedScores;

  const existing = target.scores.find((score) => score.gameNumber === change.gameNumber);
  if (
    existing &&
    existing.sideAScore === change.sideAScore &&
    existing.sideBScore === change.sideBScore
  ) {
    return unchangedScores;
  }

  const updated: GameScore = {
    gameNumber: change.gameNumber,
    sideAScore: change.sideAScore,
    sideBScore: change.sideBScore,
  };
  const scores = [
    ...target.scores.filter((score) => score.gameNumber !== change.gameNumber),
    updated,
  ].sort((a, b) => a.gameNumber - b.gameNumber);

  return {
    board: board.map((match) => (match === found ? { ...target, scores } : match)),
    needsRefresh: false,
  };
}

function applyMatch(
  board: CourtMatch[],
  change: Extract<LiveChange, { kind: 'match' }>
): LiveChangeResult {
  const target = board.find((match) => match.matchId === change.matchId);
  if (!target) return { board, needsRefresh: true };

  // 終了の取り消しは表に痕を残さない（live に戻り finished_at が空になるだけ）。
  // 「終了していた試合が live に戻った」のを見たときだけ、直している試合の印を付ける。
  const reopened = change.status === 'live' && (target.status === 'done' || target.reopened);

  const unchanged =
    target.status === change.status &&
    target.courtNumber === change.courtNumber &&
    target.orderInCourt === change.orderInCourt &&
    target.finishedAt === change.finishedAt &&
    target.maxGameCount === change.maxGameCount &&
    target.ending === change.ending &&
    target.scorerParticipantId === change.scorerParticipantId &&
    target.scorerClaimedAt === change.scorerClaimedAt &&
    target.reopened === reopened;
  if (unchanged) return { board, needsRefresh: false };

  const updated: CourtMatch = {
    ...target,
    status: change.status,
    courtNumber: change.courtNumber,
    orderInCourt: change.orderInCourt,
    finishedAt: change.finishedAt,
    maxGameCount: change.maxGameCount,
    ending: change.ending,
    scorerParticipantId: change.scorerParticipantId,
    scorerClaimedAt: change.scorerClaimedAt,
    reopened,
  };
  return {
    board: board.map((match) => (match === target ? updated : match)),
    needsRefresh: false,
  };
}

export function applyLiveChange(
  board: CourtMatch[],
  change: LiveChange,
  pendingByMatchId: PendingByMatchId
): LiveChangeResult {
  return change.kind === 'score'
    ? applyScore(board, change, pendingByMatchId)
    : applyMatch(board, change);
}

/**
 * 読み直した一覧に、読み直す前の「直している試合」の印を引き継ぐ。
 * 終了の取り消しは表に痕を残さない（live に戻るだけ）ので、読み直した一覧からは印が消える。
 * 引き継がないと、取り消して直している最中に読み直しが入ったとき、「直し中」の見た目が
 * 黙って普通の進行中に変わる。まだ進行中の試合だけに引き継ぐ。
 */
export function carryOverReopened(reloaded: CourtMatch[], previous: CourtMatch[]): CourtMatch[] {
  const reopenedIds = new Set(
    previous.filter((match) => match.reopened).map((match) => match.matchId)
  );
  if (reopenedIds.size === 0) return reloaded;

  let changed = false;
  const carried = reloaded.map((match) => {
    if (match.status !== 'live' || match.reopened || !reopenedIds.has(match.matchId)) return match;
    changed = true;
    return { ...match, reopened: true };
  });
  return changed ? carried : reloaded;
}
