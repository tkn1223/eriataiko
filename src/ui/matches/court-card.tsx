import { ClassChip } from '@/ui/components/class-chip';
import {
  CourtStatusPill,
  MineDot,
  pairNameOf,
  segmentClass,
  TeamNameTag,
  TeamSwatch,
} from '@/ui/matches/match-parts';
import { summarizeCourt, type CourtSummary } from '@/ui/matches/court-summary';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  courtNumber: number;
  /** そのコートの全試合（試合順）。いまの試合・次・進み具合はここから決める。 */
  matches: BoardMatch[];
  /** カードを押したとき（そのコートの全試合を開く）。 */
  onOpen: (courtNumber: number) => void;
};

/** 進み具合の線（そのコートの試合数ぶん）と、右の「4/8」。自分の出番の下に「▲あなた」。 */
function ProgressRow({ summary }: { summary: CourtSummary }) {
  const count = summary.segments.length;
  const markIndex = summary.myMarkIndex;
  return (
    // 1 行目＝線と「4/8」、2 行目＝線と同じ列数の枠に置いた「▲あなた」（自分の出番の真下。両端は寄せてはみ出さない）
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
      <div className="flex gap-[3px]">
        {summary.segments.map((segment) => (
          <span
            key={segment.matchId}
            data-testid="progress-segment"
            data-kind={segment.kind}
            data-mine={segment.mine || undefined}
            className={`h-1 min-w-0 flex-1 rounded-[2px] ${segmentClass(segment.kind, segment.mine)}`}
          />
        ))}
      </div>
      <span className="tabular text-[11.5px] font-bold text-[#777]">
        {summary.doneCount}/{summary.total}
      </span>
      {markIndex !== null && (
        <div
          className="mt-0.5 grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        >
          <span
            className="text-gold-ink text-[11.5px] font-extrabold whitespace-nowrap"
            style={{
              gridColumn: markIndex + 1,
              justifySelf: markIndex === 0 ? 'start' : markIndex === count - 1 ? 'end' : 'center',
            }}
          >
            ▲あなた
          </span>
        </div>
      )}
    </div>
  );
}

/** いまの試合の 1 段。■チーム色・選手名・チーム名・（金の点）と、右端に大きな点（呼出中は「–」）。 */
function CurrentLine({
  team,
  isMineSide,
  score,
}: {
  team: BoardMatch['teamA'];
  isMineSide: boolean;
  /** null は点が無い（呼出中）。 */
  score: number | null;
}) {
  return (
    <div className="flex h-[34px] items-center gap-1.5">
      <TeamSwatch team={team} size={10} />
      <span className="min-w-0 truncate text-[16px] font-extrabold">{pairNameOf(team)}</span>
      <TeamNameTag team={team} />
      {isMineSide && <MineDot />}
      <span
        className={`tabular ml-auto shrink-0 text-[28px] leading-none font-black tracking-[-0.5px] ${
          score === null ? 'text-[#bbb]' : ''
        }`}
      >
        {score === null ? '–' : score}
      </span>
    </div>
  );
}

function nextMatchName(match: BoardMatch): string {
  const undecided = match.teamA.players.length === 0 || match.teamB.players.length === 0;
  const names = `${pairNameOf(match.teamA)} vs ${pairNameOf(match.teamB)}`;
  return undecided ? `${match.roundLabel} ${names}` : names;
}

/**
 * 1a のコート 1 面ぶんのカード。**開閉は無く**、最初から全部見える
 * （進み具合の線・いまの試合 2 段＋点・次の試合）。押すとそのコートの全試合（1b）へ。
 * 自分が試合中のコートは金の枠。値は design-README の 1a のとおり。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export function CourtCard({ courtNumber, matches, onOpen }: Props) {
  const summary = summarizeCourt(matches);
  const { current, next } = summary;
  const calling = summary.status === 'waiting';
  const frame = current?.scores.find((score) => score.gameNumber === summary.shownGame);

  return (
    <div
      id={`matches-court-${courtNumber}`}
      data-testid={`matches-court-card-${courtNumber}`}
      className={`scroll-mt-[76px] rounded-[18px] ${
        summary.isMineLive ? 'court-card court-card-mine' : 'court-card'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(courtNumber)}
        className="flex min-h-11 w-full flex-col gap-2 px-3.5 pt-3 pb-1.5 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-[21px] font-extrabold whitespace-nowrap">コート{courtNumber}</span>
          {current && <ClassChip classLabel={current.classLabel} large />}
          <span className="ml-auto">
            <CourtStatusPill status={summary.status} />
          </span>
        </span>

        <ProgressRow summary={summary} />

        {current && (
          <span className="flex flex-col">
            <CurrentLine
              team={current.teamA}
              isMineSide={current.mySide === 'A'}
              score={calling ? null : (frame?.sideAScore ?? 0)}
            />
            <CurrentLine
              team={current.teamB}
              isMineSide={current.mySide === 'B'}
              score={calling ? null : (frame?.sideBScore ?? 0)}
            />
            <span className="text-[12px] font-semibold text-[#666]">
              {calling
                ? '呼び出し中'
                : summary.earlierGames.length === 0
                  ? `第${summary.shownGame}ゲーム`
                  : `第${summary.shownGame}ゲーム ・ ${summary.earlierGames
                      .map((game) => `第${game.gameNumber}G ${game.sideAScore}-${game.sideBScore}`)
                      .join(' ・ ')}`}
            </span>
          </span>
        )}

        <span className="border-line flex min-h-11 items-center gap-2 border-t pt-1">
          {summary.status === 'finished' ? (
            <>
              <span className="text-[13.5px] text-[#555]">このコートの試合は終わりました</span>
              <span className="ml-auto text-[12px] font-semibold whitespace-nowrap text-[#777]">
                結果を見る ›
              </span>
            </>
          ) : (
            <>
              {next ? (
                <>
                  <span className="shrink-0 rounded-md bg-[#2b2b2b] px-2 py-0.5 text-[11px] font-extrabold text-white">
                    次
                  </span>
                  <span className="min-w-0 truncate text-[13.5px] font-bold">
                    {nextMatchName(next)}
                  </span>
                </>
              ) : (
                <span className="text-[13.5px] text-[#555]">これが最後の試合です</span>
              )}
              <span className="ml-auto shrink-0 text-[12px] font-semibold whitespace-nowrap text-[#777]">
                全{summary.total}試合 ›
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}
