'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { matchOutcome, matchWinner, retiredSideOf } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';
import { teamPanelClasses } from '@/domain/class-labels';
import { ClassChip } from '@/ui/components/class-chip';
import { LiveDownNotice } from '@/ui/components/live-down-notice';
import { TeamPanel } from '@/ui/courts/team-panel';
import { defaultShownGame, earlierPlayedGames } from '@/ui/courts/shown-game';
import { LiveIcon, PenIcon } from '@/ui/icons';
import {
  isUndecided,
  MatchStatusPill,
  pairNameOf,
  RetiredBadge,
  TeamSwatch,
} from '@/ui/matches/match-parts';
import { MatchesSubtitle } from '@/ui/matches/matches-subtitle';
import { useLiveMatches } from '@/ui/matches/use-live-matches';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  /** 試合の一覧（前後の試合を出すのに全体を使う）。他の人の点はここに当たる。 */
  board: BoardMatch[];
  matchId: string;
  /** 参加者の id → 入力担当の名前「ケイ（もりの）」。 */
  scorerNames: Record<string, string>;
  /** ［得点を訂正する］を出すか。選手として入った人だけ true。 */
  canCorrect: boolean;
  /** 訂正を終えて戻ってきたとき、直したゲーム番号（0 は点を直していない）。通常は null。 */
  corrected: number | null;
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
};

/** 訂正した点を金の地で残す長さ。 */
const HIGHLIGHT_MS = 4000;

const WHITE_BUTTON =
  'border-btn-line flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl border bg-white text-[14.5px] font-bold';

function courtLabelOf(match: BoardMatch): string {
  return match.courtNumber === null ? 'コート未定' : `コート${match.courtNumber}`;
}

/** 「第2ゲームの途中で シン・ヒナ 棄権」。棄権した試合の最後のゲーム番号を使う。 */
function retiredNote(match: BoardMatch, side: 'A' | 'B'): string {
  const lastGame = playedGameScores(match.scores).at(-1)?.gameNumber ?? 1;
  const team = side === 'A' ? match.teamA : match.teamB;
  return `第${lastGame}ゲームの途中で ${pairNameOf(team)} 棄権`;
}

/** 結果の表の 1 チーム分（名前の欄・ゲームごとの点・取ったゲーム数）。 */
function ResultRow({
  side,
  match,
  games,
  wonGames,
  winner,
  retired,
  highlight,
}: {
  side: 'A' | 'B';
  match: BoardMatch;
  games: GameScore[];
  wonGames: number;
  winner: 'A' | 'B' | null;
  retired: boolean;
  highlight: number | null;
}) {
  const team = side === 'A' ? match.teamA : match.teamB;
  const won = winner === side;
  const colors = teamPanelClasses(team.teamNumber);
  const valueClass = won ? 'font-black' : 'font-semibold text-[#a09a91]';

  return (
    <div className="contents" data-testid={`result-row-${side}`}>
      <div className={`flex min-w-0 flex-col gap-px py-2`}>
        <span className="flex items-center gap-1.5 text-[12px] font-extrabold">
          <TeamSwatch team={team} size={9} />
          <span className={isUndecided(team) ? 'text-[#8a857d]' : colors.text}>
            {team.teamName ?? ''}
          </span>
          {won && (
            <span className="bg-gold-soft text-gold-ink rounded-[5px] px-1.5 py-px text-[11px] font-extrabold">
              勝
            </span>
          )}
          {retired && <RetiredBadge />}
        </span>
        <span
          className={`truncate text-[16px] ${won ? 'font-extrabold' : 'font-bold text-[#6b665f]'}`}
        >
          {pairNameOf(team)}
        </span>
      </div>
      {games.map((game) => (
        <span
          key={game.gameNumber}
          data-testid={`result-cell-game-${game.gameNumber}`}
          className={`tabular flex items-center justify-center rounded-lg text-[24px] ${valueClass} ${
            highlight === game.gameNumber ? 'bg-gold-soft' : ''
          }`}
        >
          {side === 'A' ? game.sideAScore : game.sideBScore}
        </span>
      ))}
      <span
        className={`tabular flex items-center justify-center text-[17px] ${
          won ? 'font-extrabold' : 'font-bold text-[#a09a91]'
        }`}
      >
        {wonGames}
      </span>
    </div>
  );
}

/** 1e 終わった試合の、ゲームごとの点の表と棄権の文。 */
function ResultTable({ match, highlight }: { match: BoardMatch; highlight: number | null }) {
  const games = playedGameScores(match.scores).sort((a, b) => a.gameNumber - b.gameNumber);
  const { wonGames } = matchOutcome(match.scores, match.maxGameCount);
  const winner = matchWinner(match.scores, match.maxGameCount, match.ending);
  const retiredSide = retiredSideOf(match.ending);

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="result-table"
        className="grid items-center"
        style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${games.length + 1}, 46px)` }}
      >
        <span />
        {games.map((game) => (
          <span key={game.gameNumber} className="text-center text-[11.5px] font-bold text-[#888]">
            第{game.gameNumber}G
          </span>
        ))}
        <span className="text-center text-[11.5px] font-bold text-[#888]">ゲーム</span>
        <ResultRow
          side="A"
          match={match}
          games={games}
          wonGames={wonGames[0]}
          winner={winner}
          retired={retiredSide === 'A'}
          highlight={highlight}
        />
        {/* 2 チームの間の線（行ごとに境界線を付けると、点を金の地にしたとき角が欠ける） */}
        <div aria-hidden="true" className="border-line col-span-full border-t" />
        <ResultRow
          side="B"
          match={match}
          games={games}
          wonGames={wonGames[1]}
          winner={winner}
          retired={retiredSide === 'B'}
          highlight={highlight}
        />
      </div>
      {retiredSide && (
        <p className="text-gold-ink text-[12.5px] font-bold">{retiredNote(match, retiredSide)}</p>
      )}
    </div>
  );
}

/** 1d 試合中・これからの、得点板（試合速報と同じ枠）。 */
function LiveBoard({ match }: { match: BoardMatch }) {
  const shown = defaultShownGame(match.scores, match.maxGameCount);
  const frame = match.scores.find((score) => score.gameNumber === shown);
  const earlier = earlierPlayedGames(match.scores, shown);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-2 text-center text-[13px] font-semibold">{`第${shown}ゲーム`}</p>
      {earlier.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-1.5">
          {earlier.map((score) => (
            <li
              key={score.gameNumber}
              className="bg-fill-tabs text-ink-2 rounded-full px-3.5 py-1 text-[12px] font-semibold"
            >
              {`第${score.gameNumber}G：`}
              <b className="tabular ml-1 font-extrabold">{`${score.sideAScore}-${score.sideBScore}`}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <TeamPanel testId="team-panel-A" team={match.teamA} score={frame?.sideAScore ?? 0} />
        <TeamPanel testId="team-panel-B" team={match.teamB} score={frame?.sideBScore ?? 0} />
      </div>
    </div>
  );
}

/** そのコートの前後 1 試合ずつ。 */
function Neighbours({ match, board }: { match: BoardMatch; board: BoardMatch[] }) {
  if (match.courtNumber === null || match.orderInCourt === null) return null;
  const inCourt = board
    .filter((other) => other.courtNumber === match.courtNumber && other.orderInCourt !== null)
    .sort((a, b) => (a.orderInCourt ?? 0) - (b.orderInCourt ?? 0));
  const index = inCourt.findIndex((other) => other.matchId === match.matchId);
  const previous = index > 0 ? inCourt[index - 1] : null;
  const next = index >= 0 ? (inCourt[index + 1] ?? null) : null;
  if (!previous && !next) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12.5px] font-extrabold text-[#666]">コート{match.courtNumber}の前後</h2>
      <ul className="border-line divide-line divide-y rounded-2xl border bg-white">
        {previous && (
          <li>
            <NeighbourLink other={previous} kind="前" />
          </li>
        )}
        {next && (
          <li>
            <NeighbourLink other={next} kind="次" />
          </li>
        )}
      </ul>
    </section>
  );
}

function NeighbourLink({ other, kind }: { other: BoardMatch; kind: '前' | '次' }) {
  const names = `${pairNameOf(other.teamA)} vs ${pairNameOf(other.teamB)}`;
  let resultText: string | null = null;
  if (other.status === 'done') {
    const { wonGames } = matchOutcome(other.scores, other.maxGameCount);
    resultText = `${wonGames[0]}-${wonGames[1]}${retiredSideOf(other.ending) ? ' 棄権' : ''}`;
  }
  return (
    <Link
      href={`/matches/${other.matchId}`}
      className="flex min-h-12 items-center gap-2 px-3 text-[13.5px] font-bold"
    >
      <span
        className={
          kind === '次'
            ? 'shrink-0 rounded-md bg-[#2b2b2b] px-2 py-0.5 text-[11px] font-extrabold text-white'
            : 'shrink-0 text-[12px] font-bold text-[#777]'
        }
      >
        {kind} {other.orderInCourt}
      </span>
      <span className="min-w-0 flex-1 truncate">{names}</span>
      {resultText && (
        <span className="tabular shrink-0 text-[12.5px] font-bold text-[#555]">{resultText}</span>
      )}
      <span aria-hidden="true" className="text-[20px] leading-none text-[#b5b0a8]">
        ›
      </span>
    </Link>
  );
}

/**
 * 試合の詳しい画面。試合中・これからは 1d（試合速報と同じ得点板と、速報への入り口）、
 * 終わった試合は 1e（ゲームごとの点の表・勝・棄権・入力担当・［得点を訂正する］）。
 * 訂正から戻ってきたときは 2c（上に緑の帯、直した点を金の地で数秒）。
 *
 * ［得点を訂正する］は、終わった試合を選手が見たときだけ出す（観戦者には出さない）。
 * 他の人の点は `use-live-matches.ts` が試合速報と同じ購読で受け取り、その場で映す。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export function MatchDetail({
  board: serverBoard,
  matchId,
  scorerNames,
  canCorrect,
  corrected,
  stageLabel,
  completedMatches,
  totalMatches,
}: Props) {
  const { board, connection } = useLiveMatches(serverBoard);
  const [highlight, setHighlight] = useState<number | null>(
    corrected !== null && corrected > 0 ? corrected : null
  );
  useEffect(() => {
    if (highlight === null) return;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  const match = board.find((candidate) => candidate.matchId === matchId);
  const subtitle = (
    <MatchesSubtitle
      stageLabel={stageLabel}
      completedMatches={completedMatches}
      totalMatches={totalMatches}
    />
  );

  if (!match) {
    return (
      <div className="mx-auto max-w-md px-3 py-6">
        {subtitle}
        <p className="text-center text-[15px] font-black">その試合は見つかりませんでした</p>
        <Link href="/matches" className="mt-4 block min-h-11 text-center text-[14px] font-bold">
          ‹ 進行表へ戻る
        </Link>
      </div>
    );
  }

  const done = match.status === 'done';
  const backHref = match.courtNumber === null ? '/matches' : `/matches?court=${match.courtNumber}`;
  const scorerName = match.scorerParticipantId ? scorerNames[match.scorerParticipantId] : undefined;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-3 pb-4">
      {subtitle}
      {connection === 'down' && (
        <div className="pt-3">
          <LiveDownNotice />
        </div>
      )}

      {corrected !== null && (
        <div
          role="status"
          className="bg-status-live text-status-live-ink mt-2.5 flex min-h-12 items-center gap-2 rounded-[14px] px-3.5 text-[14.5px] font-extrabold"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          訂正しました
          <span className="ml-auto text-[12px] font-bold">星取表・順位も更新済み</span>
        </div>
      )}

      <Link
        href={backHref}
        className="flex min-h-11 items-center gap-1 self-start px-1.5 pt-1 text-[14.5px] font-bold"
      >
        <span aria-hidden="true" className="text-[22px] leading-none">
          ‹
        </span>
        {courtLabelOf(match)}
      </Link>

      <div
        data-testid="match-detail-card"
        className={`flex flex-col gap-3 rounded-[18px] p-3.5 ${
          match.isMine ? 'court-card court-card-mine' : 'court-card'
        }`}
      >
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-extrabold">
            {courtLabelOf(match)}
            {match.orderInCourt !== null && ` ・ ${match.orderInCourt}試合目`}
          </h1>
          <span className="ml-auto">
            <MatchStatusPill status={match.status} />
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ClassChip classLabel={match.classLabel} large />
          <span className="bg-fill-tabs text-ink-3 rounded-full px-2.5 py-[3px] text-[13px] font-bold">
            {match.roundLabel}
          </span>
          <span className="bg-fill-tabs text-ink-3 rounded-full px-2.5 py-[3px] text-[13px] font-bold">
            {match.maxGameCount}ゲーム制
          </span>
        </div>

        {done ? (
          <>
            <ResultTable match={match} highlight={highlight} />
            {scorerName && (
              <p className="border-line border-t pt-2.5 text-[12px] text-[#777]">
                入力担当：{scorerName}
              </p>
            )}
          </>
        ) : (
          <>
            <LiveBoard match={match} />
            {match.courtNumber !== null && (
              <Link
                href={`/courts#court-${match.courtNumber}`}
                className="btn-plus flex min-h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold"
              >
                <LiveIcon className="text-gold-light size-5" />
                コート{match.courtNumber}の試合速報を開く
              </Link>
            )}
          </>
        )}
      </div>

      {done && (
        <div className="flex gap-2">
          {canCorrect && (
            <Link href={`/matches/${match.matchId}/correct`} className={WHITE_BUTTON}>
              <PenIcon className="size-4" />
              得点を訂正する
            </Link>
          )}
          <Link href="/bracket" className={WHITE_BUTTON}>
            星取表で見る ›
          </Link>
        </div>
      )}

      {!done && <Neighbours match={match} board={board} />}
    </div>
  );
}
