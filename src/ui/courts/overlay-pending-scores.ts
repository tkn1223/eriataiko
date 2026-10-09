import type { GameScore } from '@/domain/scoring';
import type { CourtMatch, MatchSyncState } from '@/ui/courts/types';

/**
 * サーバーから読んだ試合の一覧に、アプリの中で預かっている「手元の点」
 * （`use-score-sync.ts` の `pendingScores`。送れていない点と、送れたがまだ購読で戻ってきていない点）を
 * 重ねる。**手元の点は、サーバーの点より優先する。**
 *
 * 結果LIVE を開いたとき（下のメニューで別の画面から戻ったとき）も、画面を読み直したときも、
 * これを通す。優先しないと、押したはずの点が消えて見える（押した点はサーバーにまだ無いか、
 * 読み直しが読んだ時点より後に届いたので、読み直した数字は押す前のまま）。
 *
 * 観戦者は点を入れないので、何も混ぜない。重ねるものが無ければ受け取った一覧をそのまま返す。
 */
export function overlayPendingScores(
  board: CourtMatch[],
  canInput: boolean,
  statusByMatchId: Record<string, Pick<MatchSyncState, 'pendingScores'>>
): CourtMatch[] {
  if (!canInput) return board;

  let changed = false;
  const overlaid = board.map((match) => {
    const pending = statusByMatchId[match.matchId]?.pendingScores ?? [];
    if (pending.length === 0) return match;
    changed = true;
    return { ...match, scores: overlayGames(match.scores, pending) };
  });
  return changed ? overlaid : board;
}

/** サーバーの得点に、手元の点があるゲームだけ上書きする（ゲーム番号順）。 */
function overlayGames(serverScores: GameScore[], pending: GameScore[]): GameScore[] {
  const pendingGameNumbers = new Set(pending.map((score) => score.gameNumber));
  return [...serverScores.filter((score) => !pendingGameNumbers.has(score.gameNumber)), ...pending]
    .map((score) => ({ ...score }))
    .sort((a, b) => a.gameNumber - b.gameNumber);
}
