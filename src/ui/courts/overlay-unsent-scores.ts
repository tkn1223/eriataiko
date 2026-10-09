import type { GameScore } from '@/domain/scoring';
import type { CourtMatch, MatchSyncState } from '@/ui/courts/types';

/**
 * サーバーから読んだ試合の一覧に、アプリの中で預かっている「まだ送れていない点」
 * （`use-score-sync.ts`）を重ねる。**手元の未送信の点は、サーバーの点より優先する。**
 *
 * 結果LIVE を開いたとき（下のメニューで別の画面から戻ったとき）も、画面を読み直したときも、
 * これを通す。優先しないと、押したはずの点が消えて見える（押した点はサーバーにまだ無いので、
 * 読み直した数字は押す前のまま）。
 *
 * 観戦者は点を入れないので、何も混ぜない。重ねるものが無ければ受け取った一覧をそのまま返す。
 */
export function overlayUnsentScores(
  board: CourtMatch[],
  canInput: boolean,
  statusByMatchId: Record<string, Pick<MatchSyncState, 'unsentScores'>>
): CourtMatch[] {
  if (!canInput) return board;

  let changed = false;
  const overlaid = board.map((match) => {
    const unsent = statusByMatchId[match.matchId]?.unsentScores ?? [];
    if (unsent.length === 0) return match;
    changed = true;
    return { ...match, scores: overlayGames(match.scores, unsent) };
  });
  return changed ? overlaid : board;
}

/** サーバーの得点に、未送信のゲームだけ上書きする（ゲーム番号順）。 */
function overlayGames(serverScores: GameScore[], unsent: GameScore[]): GameScore[] {
  const unsentGameNumbers = new Set(unsent.map((score) => score.gameNumber));
  return [...serverScores.filter((score) => !unsentGameNumbers.has(score.gameNumber)), ...unsent]
    .map((score) => ({ ...score }))
    .sort((a, b) => a.gameNumber - b.gameNumber);
}
