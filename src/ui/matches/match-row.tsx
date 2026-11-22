import Link from 'next/link';
import { matchWinner, retiredSideOf } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';
import { defaultShownGame } from '@/ui/courts/shown-game';
import {
  isUndecided,
  MineDot,
  pairNameOf,
  RetiredBadge,
  TeamNameTag,
  TeamSwatch,
} from '@/ui/matches/match-parts';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  match: BoardMatch;
  /** 行の上に出す場所（「コート1」）。探す画面（1c）で、どのコートの試合かを見せるのに使う。 */
  location?: string;
};

/** 点の列の幅。終わった試合は 26px・15px、試合中は 34px・24px（design-README の 1b）。 */
const DONE_SCORE_CELL = 'w-[26px] text-[15px]';
const LIVE_SCORE_CELL = 'w-[34px] text-[24px]';

/** 1 段ぶんの点の列。 */
function ScoreLine({
  testId,
  match,
  side,
}: {
  testId: string;
  match: BoardMatch;
  side: 'A' | 'B';
}) {
  if (match.status === 'waiting') {
    return <div data-testid={testId} />;
  }

  if (match.status === 'live') {
    const shown = defaultShownGame(match.scores, match.maxGameCount);
    const frame = match.scores.find((score) => score.gameNumber === shown);
    const value = side === 'A' ? (frame?.sideAScore ?? 0) : (frame?.sideBScore ?? 0);
    return (
      <div data-testid={testId} className="flex shrink-0 justify-end">
        <span className={`tabular text-right font-black ${LIVE_SCORE_CELL}`}>{value}</span>
      </div>
    );
  }

  const games = playedGameScores(match.scores);
  return (
    <div data-testid={testId} className="flex shrink-0 justify-end">
      {games.map((game) => (
        <span
          key={game.gameNumber}
          className={`tabular text-right ${DONE_SCORE_CELL} ${
            gameWinnerOf(game) === side
              ? 'font-extrabold text-[#171717]'
              : 'font-medium text-[#a09a91]'
          }`}
        >
          {side === 'A' ? game.sideAScore : game.sideBScore}
        </span>
      ))}
    </div>
  );
}

function gameWinnerOf(game: GameScore): 'A' | 'B' | null {
  if (game.sideAScore > game.sideBScore) return 'A';
  if (game.sideBScore > game.sideAScore) return 'B';
  return null;
}

/** チーム 1 段。■チーム色＋選手名＋チーム名（＋金の点・棄権の札）。点の列は右に別で並べる。 */
function TeamLine({
  testId,
  team,
  isMineSide,
  retired,
  lost,
}: {
  testId: string;
  team: BoardMatch['teamA'];
  isMineSide: boolean;
  retired: boolean;
  lost: boolean;
}) {
  return (
    <div data-testid={testId} className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5">
      <TeamSwatch team={team} size={9} />
      <span
        className={`min-w-0 truncate text-[15px] ${
          isUndecided(team)
            ? 'font-semibold text-[#8a857d]'
            : lost
              ? 'font-semibold text-[#6b665f]'
              : 'font-extrabold'
        }`}
      >
        {pairNameOf(team)}
      </span>
      <TeamNameTag team={team} />
      {isMineSide && <MineDot />}
      {retired && <RetiredBadge />}
    </div>
  );
}

/** 行の上に出す小さな一言。試合中は緑、未定の枠は「◯◯ ・ 予選の結果で決まる」。 */
function captionOf(match: BoardMatch, location: string | undefined): string | null {
  if (match.status === 'live') {
    const shown = defaultShownGame(match.scores, match.maxGameCount);
    return `試合中 ・ ${location ? `${location} ・ ` : ''}第${shown}ゲーム`;
  }
  const undecided = isUndecided(match.teamA) || isUndecided(match.teamB);
  if (undecided && match.status === 'waiting') return `${match.roundLabel} ・ 予選の結果で決まる`;
  return location ?? null;
}

/**
 * 1 試合の行（1b・1c）。白い角丸の中に、左に「◯試合目」、中にチームごと 2 段（名前の折り返しを
 * なくすため）、右にゲームごとの点と「›」。**押すと試合の詳しい画面が開く**。
 *
 * 勝ち負けは `matchWinner`（試合の勝ち負けを決める 1 か所）で決める。棄権は点数に関係なく
 * 相手の勝ちなので、棄権した側には札「棄権」を付けて、点と勝ちが逆になっている理由を見せる。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export function MatchRow({ match, location }: Props) {
  const done = match.status === 'done';
  const winner = done ? matchWinner(match.scores, match.maxGameCount, match.ending) : null;
  const retiredSide = done ? retiredSideOf(match.ending) : null;
  const caption = captionOf(match, location);
  const testId = `match-row-${match.matchId}`;

  return (
    <li
      data-testid={testId}
      className={`rounded-2xl bg-white ${
        match.isMine
          ? 'border-gold-mine border-[1.5px] shadow-[0_6px_16px_rgb(213_162_60/0.16)]'
          : 'border-line border shadow-[0_1px_2px_rgb(0_0_0/0.04)]'
      }`}
    >
      <Link
        href={`/matches/${match.matchId}`}
        className="flex min-h-11 items-center gap-2 py-2.5 pr-2.5 pl-2"
      >
        <span className="flex w-[34px] shrink-0 flex-col items-center leading-tight">
          <span className="tabular text-[17px] font-extrabold">{match.orderInCourt ?? '–'}</span>
          <span className="text-[9.5px] font-bold text-[#999]">試合目</span>
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          {caption && (
            <span
              className={`mb-0.5 flex items-center gap-1.5 text-[11.5px] font-extrabold ${
                match.status === 'live' ? 'text-status-live-ink' : 'text-[#666]'
              }`}
            >
              {match.status === 'live' && (
                <span aria-hidden="true" className="bg-status-live-dot size-2 rounded-full" />
              )}
              {caption}
            </span>
          )}
          <div className="flex items-center gap-1">
            <TeamLine
              testId={`${testId}-line-A`}
              team={match.teamA}
              isMineSide={match.mySide === 'A'}
              retired={retiredSide === 'A'}
              lost={winner === 'B'}
            />
            <ScoreLine testId={`${testId}-scoreline-A`} match={match} side="A" />
          </div>
          <div className="flex items-center gap-1">
            <TeamLine
              testId={`${testId}-line-B`}
              team={match.teamB}
              isMineSide={match.mySide === 'B'}
              retired={retiredSide === 'B'}
              lost={winner === 'A'}
            />
            <ScoreLine testId={`${testId}-scoreline-B`} match={match} side="B" />
          </div>
        </div>

        <span aria-hidden="true" className="text-[20px] leading-none text-[#b5b0a8]">
          ›
        </span>
      </Link>
    </li>
  );
}
