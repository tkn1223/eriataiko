/**
 * 画面の印（アイコン）。画像や Web フォントは足さず（体育館の電波が細い）、インラインの SVG で描く。
 * 色は文字の色に従う（currentColor）。読み上げには出さない（aria-hidden。意味は隣の文字が持つ）。
 */
type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ShuttleIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="1.6">
        <path d="M12 21a2.5 2.5 0 0 0 2.5-2.5V17h-5v1.5A2.5 2.5 0 0 0 12 21z" />
        <path d="M9.5 17 6 4l3 1 3-2 3 2 3-1-3.5 13" />
        <path d="M9 5l1.5 12M15 5l-1.5 12M12 3v14" />
      </g>
    </Icon>
  );
}

export function FlagIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="2">
        <path d="M5 21V4" />
        <path d="M5 4h11l-2 4 2 4H5" />
      </g>
    </Icon>
  );
}

export function CrossIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path strokeWidth="2.2" d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </g>
    </Icon>
  );
}

export function LiveIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="2">
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
      </g>
    </Icon>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="1.8">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </g>
    </Icon>
  );
}

export function TreeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="1.8">
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <rect x="3" y="17" width="6" height="4" rx="1" />
        <rect x="15" y="17" width="6" height="4" rx="1" />
        <path d="M12 7v4M6 17v-3h12v3" />
      </g>
    </Icon>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </g>
    </Icon>
  );
}
