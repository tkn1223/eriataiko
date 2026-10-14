import type { BoardMatch, MatchesCourt } from '@/ui/matches/types';

/**
 * 試合の一覧（`BoardMatch[]`）から、進行表のコートのカード（`MatchesCourt[]`）を組み立てる。
 * DB も HTTP も触らない純粋な計算。
 *
 * サーバーから読んだ直後も、届いた変化を当てたあと（`apply-live-change.ts` → 画面）も、
 * 同じこの関数でカードの形にする。組み立てかたが 2 通りあると、開き直した画面と
 * 自動で更新された画面で見え方が食い違う（結果LIVE の `derive-courts.ts` と同じ考え方）。
 *
 * - コートは決め打ちせず、**試合に入っているコート番号**から出す（試合のあるコートだけ、番号順。
 *   番号が飛んでいれば飛んだまま。終わった試合しかないコートも出す。進行表は終わった試合も見せる画面）
 * - コートが決まっていない試合は、最後に 1 つの「コート未定」のカードにまとめる
 */

const UNDECIDED_KEY = 'undecided';

function orderOf(match: BoardMatch): number {
  // 順番が未定（null）は最後に回す
  return match.orderInCourt ?? Number.MAX_SAFE_INTEGER;
}

function sortedByOrder(matches: BoardMatch[]): BoardMatch[] {
  // Array.prototype.sort は安定。順番が同じ（どちらも未定など）ものは読んだ順のまま
  return [...matches].sort((a, b) => orderOf(a) - orderOf(b));
}

export function deriveMatchesCourts(board: BoardMatch[]): MatchesCourt[] {
  const courtNumbers = [
    ...new Set(board.flatMap((match) => (match.courtNumber === null ? [] : [match.courtNumber]))),
  ].sort((a, b) => a - b);

  const courts: MatchesCourt[] = courtNumbers.map((courtNumber) => ({
    key: String(courtNumber),
    courtNumber,
    matches: sortedByOrder(board.filter((match) => match.courtNumber === courtNumber)),
  }));

  const undecided = board.filter((match) => match.courtNumber === null);
  if (undecided.length > 0) {
    courts.push({ key: UNDECIDED_KEY, courtNumber: null, matches: sortedByOrder(undecided) });
  }

  return courts;
}
