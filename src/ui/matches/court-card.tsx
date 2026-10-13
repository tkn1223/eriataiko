import { MatchRow } from '@/ui/matches/match-row';
import type { BoardMatch } from '@/ui/matches/types';

type Props = {
  /** コートの番号。決まっていない試合をまとめたカードは null（「コート未定」と出す）。 */
  courtNumber: number | null;
  /** 見出しの「現在◯試合目」「残り◯試合」を出すもと。絞り込みで並ぶ試合が減っても、
   *  コートの進み具合そのものは変わらないので、そのコートの全試合を渡す。 */
  allMatches: BoardMatch[];
  /** 中身に並べる試合（絞り込み後）。 */
  listedMatches: BoardMatch[];
  isOpen: boolean;
  showDone: boolean;
  onToggleOpen: () => void;
  onToggleShowDone: () => void;
};

/**
 * 見出しの右側と、進行中がある場合の「現在◯試合目」の文言を組み立てる。
 * コートが決まっていないカードには「現在◯試合目」を出さない（どのコートの何試合目かが決まっていない）。
 */
function headingTextOf(matches: BoardMatch[], hasCourt: boolean) {
  // 進行中が 2 つあるとき（終了を取り消して直している）は、順番が後のほうを「現在」にする。
  // 結果LIVE の「今の試合」と同じ決まり（derive-courts.ts）
  const liveOrders = matches.flatMap((match) =>
    match.status === 'live' && match.orderInCourt !== null ? [match.orderInCourt] : []
  );
  const currentOrder = hasCourt && liveOrders.length > 0 ? Math.max(...liveOrders) : null;
  // 進行中の試合もまだ終わっていないので「残り」に数える。数えないと、
  // 進行中が最後の 1 試合になったコートが「残り0試合」と出て、終わったと読み違える。
  const remaining = matches.filter((match) => match.status !== 'done').length;

  return {
    liveText: currentOrder === null ? null : `現在${currentOrder}試合目`,
    rightText: remaining === 0 ? 'すべて終了' : `残り${remaining}試合`,
  };
}

/**
 * コート 1 面ぶんのカード。見出しを押すと中身が開閉する。
 * 中の行は見るだけ（押せない）。
 */
export function CourtCard({
  courtNumber,
  allMatches,
  listedMatches,
  isOpen,
  showDone,
  onToggleOpen,
  onToggleShowDone,
}: Props) {
  const { liveText, rightText } = headingTextOf(allMatches, courtNumber !== null);
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
        <span className="text-[18px] font-black tracking-[0.04em]">
          {courtNumber === null ? 'コート未定' : `コート${courtNumber}`}
        </span>
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
              <MatchRow key={match.matchId} match={match} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
