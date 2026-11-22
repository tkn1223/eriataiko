import { matchWinner } from '@/domain/match-rules';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 1c「探す」。選手名・チーム名の部分一致で試合を絞り、試合中 → これから → 終わった試合に分ける。
 * 候補を選ぶ段は挟まない（入力すれば結果がそのまま出る）。DB も画面も触らない。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

export type SearchResult = {
  live: BoardMatch[];
  upcoming: BoardMatch[];
  done: BoardMatch[];
  /** 終わった試合のうち、探した側の勝ち数・負け数。探した側が決まらない試合は数えない。 */
  record: { wins: number; losses: number };
};

/** 全角・半角のゆれと大文字小文字を無視して比べるための形にする。 */
function normalize(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

function sideMatches(team: BoardMatch['teamA'], query: string): boolean {
  // 「予選1位」のような未定の枠の名前は誰でもないので当てない
  const names = [...team.players, team.teamName ?? ''];
  return names.some((name) => normalize(name).includes(query));
}

/** コート番号・試合順の順。コートが未定・順番が未定のものは最後。 */
function byCourtAndOrder(a: BoardMatch, b: BoardMatch): number {
  const court = (match: BoardMatch) => match.courtNumber ?? Number.MAX_SAFE_INTEGER;
  const order = (match: BoardMatch) => match.orderInCourt ?? Number.MAX_SAFE_INTEGER;
  return court(a) - court(b) || order(a) - order(b);
}

export function searchMatches(board: BoardMatch[], rawQuery: string): SearchResult {
  const query = normalize(rawQuery);
  const result: SearchResult = { live: [], upcoming: [], done: [], record: { wins: 0, losses: 0 } };
  if (query === '') return result;

  const hits = board
    .filter((match) => sideMatches(match.teamA, query) || sideMatches(match.teamB, query))
    .sort(byCourtAndOrder);

  for (const match of hits) {
    if (match.status === 'live') result.live.push(match);
    else if (match.status === 'waiting') result.upcoming.push(match);
    else {
      result.done.push(match);
      const aHit = sideMatches(match.teamA, query);
      const bHit = sideMatches(match.teamB, query);
      const winner = matchWinner(match.scores, match.maxGameCount, match.ending);
      if (aHit !== bHit && winner !== null) {
        const searchedSide = aHit ? 'A' : 'B';
        if (winner === searchedSide) result.record.wins += 1;
        else result.record.losses += 1;
      }
    }
  }
  return result;
}
