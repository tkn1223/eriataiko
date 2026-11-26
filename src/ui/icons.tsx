'use client';

import { useId } from 'react';

/**
 * 画面の印（アイコン）。画像や Web フォントは足さず（体育館の電波が細い）、インラインの SVG で描く。
 * 形は demo5（docs/specs/2026-11-15-courts-redesign.png の元）の symbol を写したもの。
 * 色は文字の色に従う（currentColor）か、globals.css の変数から取る。
 * 読み上げには出さない（aria-hidden。意味は隣の文字が持つ）。
 */
type IconProps = { className?: string };

function Svg({
  className,
  viewBox = '0 0 24 24',
  children,
}: IconProps & { viewBox?: string; children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox={viewBox} fill="none" className={className}>
      {children}
    </svg>
  );
}

/** 金のにじみ（上の明るい金 → 下の濃い金）。旗とシャトルの軸に使う。 */
function GoldGradient({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: 'var(--color-gold-light)' }} />
        <stop offset="1" style={{ stopColor: 'var(--color-gold-line)' }} />
      </linearGradient>
    </defs>
  );
}

/** 上の帯のシャトル: 白い羽根と金の軸。 */
export function ShuttleIcon({ className }: IconProps) {
  const gold = useId();
  return (
    <Svg className={className} viewBox="0 0 40 40">
      <GoldGradient id={gold} />
      <path d="M8 4 L20 22 L32 4 Z" fill="#fff" opacity=".95" />
      <path
        d="M12 4 L20 22 M16 4 L20 22 M24 4 L20 22 M28 4 L20 22"
        strokeWidth="1"
        style={{ stroke: 'var(--color-feather-line)' }}
      />
      <path d="M8 4 Q20 9 32 4" strokeWidth="1.2" style={{ stroke: 'var(--color-feather-edge)' }} />
      <rect x="15" y="20" width="10" height="4" rx="1.5" fill={`url(#${gold})`} />
      <path d="M15 24 Q20 36 25 24 Z" fill={`url(#${gold})`} />
    </Svg>
  );
}

/** ［試合終了］の旗（金のにじみ）。 */
export function FlagIcon({ className }: IconProps) {
  const gold = useId();
  return (
    <Svg className={className}>
      <GoldGradient id={gold} />
      <path
        d="M5 21V4M5 4h11l-2 4 2 4H5"
        stroke={`url(#${gold})`}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** 1つ前の試合の金の時計。 */
export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g strokeWidth="1.9" strokeLinecap="round" style={{ stroke: 'var(--color-gold-line)' }}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </g>
    </Svg>
  );
}

export function PenIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M4 20l1-4L16 5l3 3L8 19z M14 7l3 3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HourglassIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** ほかの人が担当の帯の、人の印。 */
export function PeopleIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g strokeLinecap="round" style={{ stroke: 'var(--color-icon-muted)' }}>
        <circle cx="9" cy="8" r="3.2" strokeWidth="1.6" />
        <path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5" strokeWidth="1.6" />
        <circle cx="16.5" cy="9" r="2.6" strokeWidth="1.5" />
        <path d="M17 14c2.2.3 3.6 1.8 4 4.5" strokeWidth="1.5" />
      </g>
    </Svg>
  );
}

/** ［入力を引き継ぐ］の入れ替えの印。 */
export function SwapIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M4 8h14l-3-3M20 16H6l3 3"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LiveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      <path
        d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/*
 * 下のメニューの印 4 つ（2026-11-26 yosuke さんの見本の絵を写したもの）。
 * 線の太さ・角の丸めをそろえ、色は文字の色に従う（開いている項目は金、ほかは灰色。色は bottom-nav 側）。
 */
const NAV_STROKE = {
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** まっすぐ立てたシャトルの線画（羽根の先 3 つの丸み・羽根の筋 2 本・丸いコルク）。傾けて使う。 */
function ShuttleOutline() {
  return (
    <>
      <path d="M9.4 16 L5.6 6.2 A2.135 2.135 0 0 1 9.87 6.2 A2.135 2.135 0 0 1 14.13 6.2 A2.135 2.135 0 0 1 18.4 6.2 L14.6 16 Z" />
      <path d="M11 16 9.87 6.6M13 16 14.13 6.6" />
      <path d="M9.4 16v.8a2.6 2.6 0 0 0 5.2 0v-.8" />
    </>
  );
}

/** 試合速報: 右上へ飛ぶシャトルと、うしろの速さの線。 */
export function ShuttleSpeedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g {...NAV_STROKE}>
        <path d="M2 12.4h2.6M1.6 15.7h3" />
        <g transform="translate(1.4 0.6) rotate(30 12 12)">
          <ShuttleOutline />
        </g>
      </g>
    </Svg>
  );
}

/** 進行表: 3 行の一覧の札と、右下の時計。札の線は時計の後ろで途切れさせる。 */
export function ScheduleIcon({ className }: IconProps) {
  const cutout = useId();
  return (
    <Svg className={className}>
      <defs>
        <mask id={cutout}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="17.6" cy="17.2" r="5.2" fill="#000" />
        </mask>
      </defs>
      <g {...NAV_STROKE}>
        <g mask={`url(#${cutout})`}>
          <rect x="2.5" y="4" width="17" height="13.5" rx="2.6" />
          <path d="M9 8h7.5M9 11h7.5M9 14h4" />
        </g>
        <path d="M6 8h.4M6 11h.4M6 14h.4" strokeWidth="2.4" />
        <circle cx="17.6" cy="17.2" r="3.9" />
        <path d="M17.6 15.4v1.9l1.3 1" />
      </g>
    </Svg>
  );
}

/** 対戦表: 左右の組の括弧が、真ん中の箱（決勝）でつながる。 */
export function BracketIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g {...NAV_STROKE}>
        <path d="M2.5 6.5h3v11h-3M21.5 6.5h-3v11h3M5.5 12h3M15.5 12h3" />
        <rect x="8.5" y="10.4" width="7" height="3.2" rx="0.9" />
      </g>
    </Svg>
  );
}

/** myページ: 留め具の付いた名札。左に小さなシャトル、右に名前の 2 本線。札の線は留め具の後ろで途切れさせる。 */
export function BadgeIcon({ className }: IconProps) {
  const cutout = useId();
  return (
    <Svg className={className}>
      <defs>
        <mask id={cutout}>
          <rect width="24" height="24" fill="#fff" />
          <rect x="9.3" y="2.3" width="5.4" height="6.6" rx="2" fill="#000" />
        </mask>
      </defs>
      <g {...NAV_STROKE}>
        <rect x="2.5" y="6.5" width="19" height="13" rx="2.6" mask={`url(#${cutout})`} />
        <rect x="10.2" y="3.2" width="3.6" height="4.8" rx="1.3" />
        {/* 小さく縮めると線も細くなるので、縮める分だけ太く描く */}
        <g
          transform="translate(8.3 13) rotate(30) scale(0.42) translate(-12 -11.5)"
          strokeWidth="2.6"
        >
          <ShuttleOutline />
        </g>
        <path d="M14 12h4.5M14 15h4.5" />
      </g>
    </Svg>
  );
}
