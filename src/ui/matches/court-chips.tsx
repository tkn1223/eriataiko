'use client';

import type { CourtStatus } from '@/ui/matches/court-summary';

/**
 * コート札の列。縦長のバドミントンコートを線で描いた札で、番号と状態の点が付く。
 * 1a では押すとそのコートのカードへ移り、1b では押すと隣のコートの全試合へ移る
 * （先頭に「‹ 全コート」の札。開いているコートの札は黒）。
 * 札は押せるところなので 44px 以上（幅 44・高さ 62）。値は
 * docs/specs/2026-11-22-matches-redesign/design-README.md の「コート札」のとおり。
 */

export type CourtChipItem = { courtNumber: number; status: CourtStatus };

const STATUS_LABELS: Record<CourtStatus, string> = {
  live: '試合中',
  waiting: '呼出中',
  finished: '全試合終了',
};

/** 状態の点の色（試合中・呼出中・全試合終了）。 */
const DOT_COLORS: Record<CourtStatus, string> = {
  live: '#22a04b',
  waiting: '#e0a93a',
  finished: '#b5b0a8',
};

/** 床・線・枠・番号の色。通常／全試合終了／開いているコート（黒）。 */
type Palette = { floor: string; line: string; edge: string; number: string; edgeWidth: number };

function paletteOf(status: CourtStatus, active: boolean): Palette {
  if (active) {
    return { floor: '#22272e', line: '#c99a3e', edge: '#d5a23c', number: '#ffffff', edgeWidth: 2 };
  }
  if (status === 'finished') {
    return { floor: '#f2f0ec', line: '#cfcac2', edge: '#e0dcd4', number: '#8a857d', edgeWidth: 1 };
  }
  return { floor: '#fff4df', line: '#d9b56b', edge: '#ead9b4', number: '#171717', edgeWidth: 1 };
}

function CourtChip({
  item,
  active,
  onSelect,
}: {
  item: CourtChipItem;
  active: boolean;
  onSelect: (courtNumber: number) => void;
}) {
  const palette = paletteOf(item.status, active);
  return (
    <button
      type="button"
      aria-label={`コート${item.courtNumber} ${STATUS_LABELS[item.status]}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(item.courtNumber)}
      className="relative h-[62px] w-11 shrink-0 rounded-lg"
      style={{
        background: palette.floor,
        boxShadow: `inset 0 0 0 ${palette.edgeWidth}px ${palette.edge}`,
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 44 62" className="absolute inset-0 size-full">
        <g fill="none" stroke={palette.line}>
          <rect x="5" y="5" width="34" height="52" strokeWidth="1.5" />
          <line x1="5" y1="31" x2="39" y2="31" strokeWidth="1.5" />
          <line x1="5" y1="20.5" x2="39" y2="20.5" strokeWidth="1" />
          <line x1="5" y1="41.5" x2="39" y2="41.5" strokeWidth="1" />
          <line x1="22" y1="5" x2="22" y2="57" strokeWidth="1" opacity="0.6" />
        </g>
      </svg>
      {/* 番号の後ろは床の色で塗って線を隠す */}
      <span
        className="tabular absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1 text-[16px] leading-none font-black"
        style={{ background: palette.floor, color: palette.number }}
      >
        {item.courtNumber}
      </span>
      <span
        aria-hidden="true"
        className="border-page absolute -top-0.5 -right-0.5 box-content size-2.5 rounded-full border-2"
        style={{ background: DOT_COLORS[item.status] }}
      />
    </button>
  );
}

export function CourtChipStrip({
  courts,
  activeCourt = null,
  onSelect,
  onBack,
}: {
  courts: CourtChipItem[];
  /** 開いているコート（1b）。1a では指定しない。 */
  activeCourt?: number | null;
  onSelect: (courtNumber: number) => void;
  /** 渡すと先頭に「‹ 全コート」の札が出る（1b）。 */
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pt-3 pr-1 pb-1 pl-0.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="border-btn-line h-[62px] shrink-0 rounded-xl border bg-white px-3 text-[14.5px] font-bold whitespace-nowrap"
        >
          ‹ 全コート
        </button>
      )}
      {courts.map((item) => (
        <CourtChip
          key={item.courtNumber}
          item={item}
          active={item.courtNumber === activeCourt}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
