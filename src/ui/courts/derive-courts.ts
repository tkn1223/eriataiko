import type { Court, CourtMatch, LiveMatch, NextMatch, PreviousMatch } from '@/ui/courts/types';

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

function toPreviousMatch(match: CourtMatch): PreviousMatch {
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

/**
 * そのコートの 1 つ前の試合。終了の時刻が一番新しい終わった試合。
 * 時刻の書き方が違っても（`+00:00` と `Z`）新しさを比べられるよう、日時にしてから比べる。
 * 終了の時刻が無い試合は新しさを決められないので選ばない。
 */
function newestFinished(matches: CourtMatch[]): CourtMatch | undefined {
  const finishedAt = (match: CourtMatch) => Date.parse(match.finishedAt ?? '');
  return matches
    .filter((match) => match.status === 'done' && match.finishedAt !== null)
    .sort((a, b) => finishedAt(b) - finishedAt(a) || orderOf(b) - orderOf(a))[0];
}

function buildCourt(courtNumber: number, matches: CourtMatch[]): Court {
  const onThisCourt = matches.filter((match) => match.courtNumber === courtNumber);
  const lives = onThisCourt.filter((match) => match.status === 'live').sort(byOrderInCourt);
  const nextMatch = onThisCourt
    .filter((match) => match.status === 'waiting')
    .sort(byOrderInCourt)[0];

  // 進行中が 2 つ以上あるときは、順番が後の試合が「今の試合」、前の試合が「直し中」。
  // 終了を取り消された試合（reopened）は、1 つだけでも直し中として出す
  // （今の試合の枠は空け、次の試合を呼出待ちとして残す）。
  // 今の試合以外は、3 つ以上でも黙って消さず、全部直し中として出す。
  const current = lives.filter((match) => !match.reopened).at(-1);
  const fixing = lives.filter((match) => match !== current);

  // 直し中の試合があるときは、1 つ前を出さない。取り消した試合を直している間に、もっと前の
  // 試合が「1 つ前」として現れて、2 つ以上前の試合まで直せてしまわないようにするため。
  const previous = fixing.length === 0 ? newestFinished(onThisCourt) : undefined;

  return {
    courtNumber,
    live: current ? toLiveMatch(current) : null,
    next: nextMatch ? toNextMatch(nextMatch) : null,
    fixing: fixing.map(toLiveMatch),
    previous: previous ? toPreviousMatch(previous) : null,
  };
}

export function deriveCourts(matches: CourtMatch[]): Court[] {
  // コートの枚数は決め打ちせず、進行中・未実施の試合が入っているコート番号から出す
  // （番号が飛んでいれば飛んだまま。コート未定の試合はカードにしない）。
  // 終わった試合は、1 つ前として出せるもの（終了の時刻がある）だけがコートを増やす。
  // 最後の試合が終わったコートでも、直せるようにカードを残すため。
  const courtNumbers = [
    ...new Set(
      matches.flatMap((match) =>
        match.courtNumber !== null && (match.status !== 'done' || match.finishedAt !== null)
          ? [match.courtNumber]
          : []
      )
    ),
  ].sort((a, b) => a - b);

  return courtNumbers.map((courtNumber) => buildCourt(courtNumber, matches));
}
