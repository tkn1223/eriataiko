'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabbar, TabbarLink } from 'konsta/react';
import { TABS } from '@/config/tabs';

/**
 * 画面下のメニュー。
 *
 * 片手・汗ばんだ指で押されるので、親指の届く下側に置く。
 * 画面に貼り付けて（fixed）スクロールしても消えないようにする。
 * メニューの増減は src/config/tabs.ts を直す。
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <Tabbar
      labels
      icons
      // 読み上げで「メニュー」として拾えるように div ではなく nav で出す
      component="nav"
      aria-label="メインメニュー"
      className="fixed bottom-0 left-0 z-20"
      // Konsta の既定の高さ（iOS 50px）だと汗ばんだ指には狭いので広げる
      innerClassName="min-h-16"
    >
      {TABS.map((tab) => {
        const isCurrent = pathname === tab.href;

        return (
          <TabbarLink
            key={tab.href}
            component={NextLink}
            active={isCurrent}
            // href のようなリンク側の属性は linkProps でまとめて渡す決まり。
            // aria-current は、色だけでは現在地が伝わらない人のための印。
            linkProps={{ href: tab.href, 'aria-current': isCurrent ? 'page' : undefined }}
            icon={
              <span aria-hidden="true" className="text-xl leading-none">
                {tab.icon}
              </span>
            }
            label={tab.label}
          />
        );
      })}
    </Tabbar>
  );
}
