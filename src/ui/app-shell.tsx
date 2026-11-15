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
 * 背景は #FAF9F7、上の帯はほぼ黒の斜めのにじみ・右上の金の光・下の端の金の細い弧に、白い羽根と金の軸のシャトルの印と白い太字の大会名。
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
        <header className="app-bar sticky top-0 z-10 px-[18px] pt-[calc(14px+env(safe-area-inset-top))] pb-4">
          <div className="flex items-center gap-3">
            <ShuttleIcon className="size-10 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
            <div className="min-w-0">
              {/* 見出しとして扱われるよう h1 にする */}
              <h1 className="truncate text-[18px] font-bold tracking-[0.02em] text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="text-bar-sub mt-0.5 truncate text-[12.5px] font-medium">{subtitle}</p>
              )}
            </div>
          </div>
        </header>
        {children}
        {/* 一番下の内容が、画面に貼り付いたメニューの裏に隠れないための余白 */}
        <div aria-hidden="true" className="h-24" />
      </Page>
      <BottomNav />
    </NavbarSubtitleSetterContext.Provider>
  );
}
