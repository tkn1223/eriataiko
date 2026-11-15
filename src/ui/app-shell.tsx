'use client';

import { useState, type ReactNode } from 'react';
import { Page } from 'konsta/react';
import { BottomNav } from '@/ui/bottom-nav';
import { ShuttleIcon } from '@/ui/icons';
import { NavbarSubtitleSetterContext } from '@/ui/navbar-subtitle';

/**
 * メニュー付き画面すべての外枠。
 *
 * Konsta のコンポーネントはクライアント専用なので、Server Component の
 * layout.tsx からはこれを挟んで使う（layout.tsx が直接 konsta を import すると
 * createContext が無くてビルドが落ちる）。
 *
 * 見た目は黒・金・白（色は globals.css の @theme。docs/specs/2026-11-15-courts-redesign.md）。
 * 背景は白、上の帯は黒地に金のシャトルの印と白い印と白い太字の大会名。
 * 大会名の下は、普段は空。画面が `NavbarSubtitle`（`navbar-subtitle.tsx`）を描いたときだけ、
 * 薄い灰色の文字で一言を出す（試合速報の「予選リーグ 1/3 試合」）。ほかの画面の帯は大会名だけ。
 *
 * **大会名は決め打ちせず、渡されたものを出す。** 表（`competitions.name`）から
 * 読むのは layout.tsx の役目。ここは画面の部品なので DB を知らない。
 */
export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const [subtitle, setSubtitle] = useState<ReactNode>(null);

  return (
    <NavbarSubtitleSetterContext.Provider value={setSubtitle}>
      <Page colors={{ bgIos: 'bg-page', bgMaterial: 'bg-page' }}>
        <header className="bg-bar sticky top-0 z-10 flex items-center gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
          <ShuttleIcon className="size-[30px] shrink-0 text-white" />
          <div className="min-w-0">
            {/* 見出しとして扱われるよう h1 にする */}
            <h1 className="truncate text-[17px] font-bold tracking-[0.02em] text-white">{title}</h1>
            {subtitle && (
              <p className="text-bar-sub mt-[3px] text-[12px] font-medium tracking-[0.05em] whitespace-nowrap">
                {subtitle}
              </p>
            )}
          </div>
        </header>
        {children}
        {/* 一番下の内容が、画面に貼り付いたメニューの裏に隠れないための余白 */}
        <div aria-hidden="true" className="h-20" />
      </Page>
      <BottomNav />
    </NavbarSubtitleSetterContext.Provider>
  );
}
