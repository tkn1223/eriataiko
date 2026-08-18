import { MatchRow } from '@/ui/matches/match-row';
import type { CourtMatch } from '@/ui/matches/sample-data';

type Props = {
  courtNumber: number;
  /** 見出しの「現在◯試合目」「残り◯試合」を出すもと。絞り込みで並ぶ試合が減っても、
   *  コートの進み具合そのものは変わらないので、そのコートの全試合を渡す。 */
  allMatches: CourtMatch[];
  /** 中身に並べる試合（絞り込み後）。 */
  listedMatches: CourtMatch[];
  isOpen: boolean;
  showDone: boolean;
  onToggleOpen: () => void;
  onToggleShowDone: () => void;
  onSelectMatch: (match: CourtMatch) => void;
};

/** 見出しの右側と、進行中がある場合の「現在◯試合目」の文言を組み立てる。 */
function headingTextOf(matches: CourtMatch[]) {
  if (matches.length === 0) {
    return { liveText: null, rightText: '予定なし' };
  }

  const liveMatch = matches.find((match) => match.status === 'live');
  // 進行中の試合もまだ終わっていないので「残り」に数える。数えないと、
  // 進行中が最後の 1 試合になったコートが「残り0試合」と出て、終わったと読み違える。
  const remaining = matches.filter((match) => match.status !== 'done').length;

  return {
    liveText: liveMatch ? `現在${liveMatch.orderInCourt}試合目` : null,
    rightText: remaining === 0 ? 'すべて終了' : `残り${remaining}試合`,
  };
}

/**
 * コート 1 面ぶんのカード。見出しを押すと中身が開閉する。
 */
export function CourtCard({
  courtNumber,
  allMatches,
  listedMatches,
  isOpen,
  showDone,
  onToggleOpen,
  onToggleShowDone,
  onSelectMatch,
}: Props) {
  const { liveText, rightText } = headingTextOf(allMatches);
  const doneMatches = listedMatches.filter((match) => match.status === 'done');
  const visibleMatches = showDone
    ? listedMatches
    : listedMatches.filter((match) => match.status !== 'done');

  return (
    <div className="mb-[14px] rounded-[14px] border border-gray-200 bg-white px-4 pt-0.5 pb-1">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        className="flex min-h-11 w-full items-center gap-[10px] py-[15px] text-left"
      >
        <span className="text-[18px] font-black tracking-[0.04em]">コート{courtNumber}</span>
        {liveText && (
          <span className="text-accent text-[12px] font-extrabold whitespace-nowrap">
            {liveText}
          </span>
        )}
        <span className="ml-auto text-[12px] font-bold whitespace-nowrap text-gray-400">
          {rightText}
        </span>
        <span aria-hidden="true" className="text-[11px] font-extrabold text-gray-400">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 pt-2 pb-2">
          {doneMatches.length > 0 && (
            <button
              type="button"
              onClick={onToggleShowDone}
              className="mb-2 min-h-11 w-full rounded-lg bg-gray-100 px-3 py-[7px] text-left text-[12px] font-extrabold text-gray-500"
            >
              {showDone
                ? `✓ 終了した${doneMatches.length}試合を隠す`
                : `✓ 終了した${doneMatches.length}試合を見る`}
            </button>
          )}

          <ul className="divide-y divide-dashed divide-gray-200">
            {visibleMatches.map((match) => (
              <MatchRow key={match.id} match={match} onSelect={() => onSelectMatch(match)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
