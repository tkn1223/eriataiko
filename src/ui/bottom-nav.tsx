'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from '@/config/tabs';
import { CalendarIcon, LiveIcon, TreeIcon, UserIcon } from '@/ui/icons';

const ICONS = {
  live: LiveIcon,
  calendar: CalendarIcon,
  tree: TreeIcon,
  user: UserIcon,
} as const;

/**
 * 画面下のメニュー。ほぼ黒地で、いま開いている項目だけ金色の文字と少し明るい下地、ほかは薄い灰色
 * （色は globals.css の @theme。docs/specs/2026-11-15-courts-redesign.md）。
 *
 * 片手・汗ばんだ指で押されるので、親指の届く下側に置き、1 項目の高さは 64px（44px 以上）。
 * 画面に貼り付けて（fixed）スクロールしても消えないようにする。
 * メニューの増減は src/config/tabs.ts を直す。
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインメニュー"
      className="bg-bar fixed bottom-0 left-0 z-20 grid w-full grid-cols-4 gap-1 px-1.5 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
    >
      {TABS.map((tab) => {
        const isCurrent = pathname === tab.href;
        const Icon = ICONS[tab.icon];

        return (
          <NextLink
            key={tab.href}
            href={tab.href}
            // 色だけでは現在地が伝わらない人のための印
            aria-current={isCurrent ? 'page' : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${
              isCurrent ? 'text-gold bg-nav-active' : 'text-bar-muted'
            }`}
          >
            <Icon className="size-6" />
            {tab.label}
          </NextLink>
        );
      })}
    </nav>
  );
}
