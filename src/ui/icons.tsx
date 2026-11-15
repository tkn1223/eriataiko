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

export function CalendarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4 10h16M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M8 13.5h2M12 13.5h2M16 13.5h0M8 16.5h2M12 16.5h2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function TreeIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g stroke="currentColor" strokeWidth="1.6">
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <rect x="3" y="16" width="6" height="4" rx="1" />
        <rect x="15" y="16" width="6" height="4" rx="1" />
        <path d="M12 7v4M6 16v-5h12v5" />
      </g>
    </Svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <g stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4.5 4.4-6.5 8-6.5s7 2 8 6.5" strokeLinecap="round" />
      </g>
    </Svg>
  );
}
