import type { GameScore } from '@/domain/scoring';
import { defaultShownGame, earlierPlayedGames } from '@/ui/courts/shown-game';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 1a のコートのカードに出すものを、そのコートの試合（順番どおり）から決める。DB も画面も触らない。
 * 届いた変化を当てたあとも同じ関数で作り直す（`derive-matches-courts.ts` と同じ考え方）。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

export type CourtStatus = 'live' | 'waiting' | 'finished';

/**
 * 進み具合の線の 1 本。
 * - done: 終わった ／ live: 試合中 ／ calling: 呼出中のいまの試合 ／ upcoming: これから
 * - mine: 自分の出番（未実施）。金で塗る
 */
export type ProgressSegment = {
  matchId: string;
  kind: 'done' | 'live' | 'calling' | 'upcoming';
  mine: boolean;
};

export type CourtSummary = {
  status: CourtStatus;
  doneCount: number;
  total: number;
  /** 試合中も数える。数えないと、最後の 1 試合が試合中のコートが「残り 0」と出て、終わったと読み違える。 */
  remaining: number;
  /** いまの試合。試合中があればそれ（2 つなら順番が後ろ）、無ければ先頭の未実施（呼出中）。全部終わっていれば null。 */
  current: BoardMatch | null;
  /** 次の試合。いまの試合より後ろの、先頭の未実施。 */
  next: BoardMatch | null;
  segments: ProgressSegment[];
  /** ▲あなた を出す線の位置。自分の出番の最初の 1 つ。自分の出番が無ければ null。 */
  myMarkIndex: number | null;
  /** 自分が試合中のコート（カードを金の枠にする）。 */
  isMineLive: boolean;
  /** いまの試合で出しているゲーム番号。 */
  shownGame: number;
  /** いまの試合の、出しているゲームより前の終わったゲーム（「第2ゲーム ・ 第1G 21-18」の元）。 */
  earlierGames: GameScore[];
};

export function summarizeCourt(matches: BoardMatch[]): CourtSummary {
  const liveMatches = matches.filter((match) => match.status === 'live');
  const waitingMatches = matches.filter((match) => match.status === 'waiting');
  const doneCount = matches.filter((match) => match.status === 'done').length;

  const status: CourtStatus =
    liveMatches.length > 0 ? 'live' : waitingMatches.length > 0 ? 'waiting' : 'finished';

  const current = liveMatches.at(-1) ?? waitingMatches[0] ?? null;
  const currentIndex = current ? matches.indexOf(current) : -1;
  const next = matches.slice(currentIndex + 1).find((match) => match.status === 'waiting') ?? null;

  const segments: ProgressSegment[] = matches.map((match) => ({
    matchId: match.matchId,
    kind:
      match.status === 'done'
        ? 'done'
        : match.status === 'live'
          ? 'live'
          : status === 'waiting' && match === current
            ? 'calling'
            : 'upcoming',
    mine: match.isMine && match.status === 'waiting',
  }));
  const myMarkIndex = segments.findIndex((segment) => segment.mine);

  return {
    status,
    doneCount,
    total: matches.length,
    remaining: matches.length - doneCount,
    current,
    next,
    segments,
    myMarkIndex: myMarkIndex === -1 ? null : myMarkIndex,
    isMineLive: current?.status === 'live' && current.isMine,
    shownGame: current ? defaultShownGame(current.scores, current.maxGameCount) : 1,
    earlierGames: current
      ? earlierPlayedGames(current.scores, defaultShownGame(current.scores, current.maxGameCount))
      : [],
  };
}
