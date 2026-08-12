'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Link, Toolbar } from 'konsta/react';
import { TABS } from '@/lib/tabs';

/**
 * 画面上部のタブ。
 *
 * SP 幅では 5 個が 1 行に収まらないので横スクロールさせる。
 * 折り返すとヘッダーの高さが変わって内容が飛ぶため、1 行維持のほうが扱いやすい。
 * タブの増減は src/lib/tabs.ts を直す。
 */
export function TabNav() {
  const pathname = usePathname();

  return (
    <Toolbar
      top
      tabbar
      // Konsta の tabbar は「等幅で画面いっぱい」が既定。5 個を SP 幅に詰めると
      // ラベルが潰れるので、横スクロールに逃がす。
      innerClassName="!justify-start overflow-x-auto no-scrollbar"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          component={NextLink}
          href={tab.href}
          tabbarActive={pathname === tab.href}
          // tabbar のリンクは既定で w-full（= 1 個で画面幅を占める）なので上書きする
          className="!w-auto shrink-0 px-5 whitespace-nowrap"
        >
          {tab.label}
        </Link>
      ))}
    </Toolbar>
  );
}
