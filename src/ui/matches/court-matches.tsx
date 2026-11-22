import { ClassChip } from '@/ui/components/class-chip';
import { CourtStatusPill, segmentClass } from '@/ui/matches/match-parts';
import { MatchRow } from '@/ui/matches/match-row';
import { summarizeCourt } from '@/ui/matches/court-summary';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 1b そのコートの全試合。見出し（コート名・部・状態・進み具合の線）の下に、
 * 「終わった試合」「試合中」「これから」の順に分けて**全部**出す（終わった試合も隠さない）。
 * 行を押すと試合の詳しい画面が開く。コート札の列は呼び出し側（`matches-page.tsx`）が上に出す。
 *
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */
export function CourtMatches({
  courtNumber,
  matches,
}: {
  courtNumber: number;
  matches: BoardMatch[];
}) {
  const summary = summarizeCourt(matches);
  const groups = [
    {
      key: 'done',
      title: '終わった試合',
      items: matches.filter((match) => match.status === 'done'),
    },
    { key: 'live', title: '試合中', items: matches.filter((match) => match.status === 'live') },
    {
      key: 'waiting',
      title: 'これから',
      items: matches.filter((match) => match.status === 'waiting'),
    },
  ];
  const classLabel = (summary.current ?? matches.at(-1))?.classLabel;

  return (
    <div data-testid="court-matches" className="flex flex-col gap-1.5 pt-3">
      <h2 className="flex items-center gap-2 text-[26px] font-extrabold">
        コート{courtNumber}
        {classLabel && <ClassChip classLabel={classLabel} large />}
        <span className="ml-auto text-[12px]">
          <CourtStatusPill status={summary.status} />
        </span>
      </h2>

      <div className="flex items-center gap-2 pb-2">
        <div className="flex min-w-0 flex-1 gap-[3px]">
          {summary.segments.map((segment) => (
            <span
              key={segment.matchId}
              className={`h-[5px] min-w-0 flex-1 rounded-[2px] ${segmentClass(segment.kind, segment.mine)}`}
            />
          ))}
        </div>
        <span className="tabular text-[11.5px] font-bold whitespace-nowrap text-[#777]">
          {summary.doneCount}/{summary.total} ・ 残り{summary.remaining}
        </span>
      </div>

      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.key} className="flex flex-col gap-2">
              <h3 className="mt-1.5 text-[12.5px] font-extrabold text-[#666]">
                {group.key === 'live' ? group.title : `${group.title} ${group.items.length}`}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.items.map((match) => (
                  <MatchRow key={match.matchId} match={match} />
                ))}
              </ul>
            </section>
          )
      )}
    </div>
  );
}
