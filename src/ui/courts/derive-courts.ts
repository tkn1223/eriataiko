import type { Court, CourtMatch, LiveMatch, NextMatch } from '@/ui/courts/types';

/**
 * 試合の一覧（`CourtMatch[]`）から、コートのカード（`Court[]`）を組み立てる。
 * DB も HTTP も触らない純粋な計算。
 *
 * サーバーから読んだ直後（`build-courts-view.ts`）も、届いた変化を当てたあと
 * （`apply-live-change.ts` → 画面）も、同じこの関数でカードの形にする。
 * 組み立てかたが 2 通りあると、開き直した画面と自動で更新された画面で見え方が食い違う。
 */

function orderOf(match: CourtMatch): number {
  // 順番が未定（null）は最後に回す
  return match.orderInCourt ?? Number.MAX_SAFE_INTEGER;
}

function byOrderInCourt(a: CourtMatch, b: CourtMatch): number {
  return orderOf(a) - orderOf(b);
}

function toLiveMatch(match: CourtMatch): LiveMatch {
  return {
    matchId: match.matchId,
    classLabel: match.classLabel,
    roundLabel: match.roundLabel,
    teamA: match.teamA,
    teamB: match.teamB,
    isMine: match.isMine,
    scores: match.scores,
    maxGameCount: match.maxGameCount,
  };
}

function toNextMatch(match: CourtMatch): NextMatch {
  return {
    matchId: match.matchId,
    classLabel: match.classLabel,
    roundLabel: match.roundLabel,
    teamA: match.teamA,
    teamB: match.teamB,
    isMine: match.isMine,
    maxGameCount: match.maxGameCount,
  };
}

function buildCourt(courtNumber: number, matches: CourtMatch[]): Court {
  const onThisCourt = matches.filter((match) => match.courtNumber === courtNumber);
  const liveMatch = onThisCourt.filter((match) => match.status === 'live').sort(byOrderInCourt)[0];
  const nextMatch = onThisCourt
    .filter((match) => match.status === 'waiting')
    .sort(byOrderInCourt)[0];

  return {
    courtNumber,
    live: liveMatch ? toLiveMatch(liveMatch) : null,
    next: nextMatch ? toNextMatch(nextMatch) : null,
  };
}

export function deriveCourts(matches: CourtMatch[]): Court[] {
  // コートの枚数は決め打ちせず、進行中・未実施の試合が入っているコート番号から出す
  // （番号が飛んでいれば飛んだまま。コート未定の試合はカードにしない）。
  const courtNumbers = [
    ...new Set(
      matches.flatMap((match) =>
        match.status !== 'done' && match.courtNumber !== null ? [match.courtNumber] : []
      )
    ),
  ].sort((a, b) => a - b);

  return courtNumbers.map((courtNumber) => buildCourt(courtNumber, matches));
}
