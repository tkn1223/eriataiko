import { hasAnyPoint, type GameScore } from '@/domain/scoring';
import { activeMatchId, type Court, type LiveScore, type MatchSyncState } from '@/ui/courts/types';

/**
 * 結果LIVE を開いたときの、コートごとの得点の初期値。
 *
 * サーバーから読んだ得点を元に、アプリの中で預かっている「まだ送れていない点」
 * （`use-score-sync.ts`）があれば**そちらの数字を優先**する。優先しないと、下のメニューで
 * 別の画面から戻った瞬間に、押したはずの点が消えて見える（押した点は預かり場所にあるが、
 * サーバーにはまだ無いので、読み直した数字は押す前のまま）。
 *
 * 観戦者は点を入れないので、何も混ぜない。
 */
export function initialLiveScores(
  courts: Court[],
  canInput: boolean,
  statusByMatchId: Record<string, MatchSyncState>
): Record<number, LiveScore> {
  const entries: Array<[number, LiveScore]> = [];

  for (const court of courts) {
    const syncState = canInput ? statusByMatchId[activeMatchId(court, canInput) ?? ''] : undefined;
    const unsent = syncState?.unsentScores ?? [];

    if (court.live) {
      entries.push([
        court.courtNumber,
        {
          scores: overlayUnsent(court.live.scores, unsent),
          finished: false,
          started: true,
        },
      ]);
      continue;
    }

    // 呼出待ち（選手だけ）。まだ何も押していなければ状態は作らない（呼出待ちのまま）。
    // 押した点が送れていなければ数字を戻す。一度でも点を押した試合は、0 対 0 に戻していても
    // LIVE の見た目にする（離れる前の画面がそうだったため。仕様「0 対 0 に戻しても LIVE のまま」）
    const started = (syncState?.started ?? false) || hasAnyPoint(unsent);
    if (unsent.length > 0 || started) {
      entries.push([
        court.courtNumber,
        { scores: overlayUnsent([], unsent), finished: false, started },
      ]);
    }
  }

  return Object.fromEntries(entries);
}

/** サーバーの得点に、未送信のゲームだけ上書きする（ゲーム番号順）。 */
function overlayUnsent(serverScores: GameScore[], unsent: GameScore[]): GameScore[] {
  if (unsent.length === 0) return serverScores;
  const unsentGameNumbers = new Set(unsent.map((score) => score.gameNumber));
  return [...serverScores.filter((score) => !unsentGameNumbers.has(score.gameNumber)), ...unsent]
    .map((score) => ({ ...score }))
    .sort((a, b) => a.gameNumber - b.gameNumber);
}
