'use client';

import { useState, type ReactNode } from 'react';
import { Navbar, Page } from 'konsta/react';
import { BottomNav } from '@/ui/bottom-nav';
import { NavbarRightSetterContext } from '@/ui/navbar-right';

/**
 * メニュー付き画面すべての外枠。
 *
 * Konsta のコンポーネントはクライアント専用なので、Server Component の
 * layout.tsx からはこれを挟んで使う（layout.tsx が直接 konsta を import すると
 * createContext が無くてビルドが落ちる）。
 *
 * 上のバーの右端は、普段は空。画面が `NavbarRight`（`navbar-right.tsx`）を描いたときだけ、
 * そこに一言を出す（結果LIVE の「予選リーグ 1/3 試合」）。ほかの画面のバーは変わらない。
 *
 * **大会名は決め打ちせず、渡されたものを出す。** 表（`competitions.name`）から
 * 読むのは layout.tsx の役目。ここは画面の部品なので DB を知らない。
 */
export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [navbarRight, setNavbarRight] = useState<ReactNode>(null);

  return (
    <NavbarRightSetterContext.Provider value={setNavbarRight}>
      <Page>
        {/* Konsta の title はただのテキストになるので、見出しとして扱われるよう h1 を渡す */}
        <Navbar
          title={<h1 className="truncate text-inherit">{title}</h1>}
          right={navbarRight ?? undefined}
        />
        {children}
        {/* 一番下の内容が、画面に貼り付いたメニューの裏に隠れないための余白 */}
        <div aria-hidden="true" className="h-20" />
      </Page>
      <BottomNav />
    </NavbarRightSetterContext.Provider>
  );
}
