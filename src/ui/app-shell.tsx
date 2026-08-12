'use client';

import type { ReactNode } from 'react';
import { Navbar, Page } from 'konsta/react';
import { TabNav } from '@/ui/tab-nav';
import { TOURNAMENT_NAME } from '@/config/tournament';

/**
 * タブ付き画面すべての外枠。
 *
 * Konsta のコンポーネントはクライアント専用なので、Server Component の
 * layout.tsx からはこれを挟んで使う（layout.tsx が直接 konsta を import すると
 * createContext が無くてビルドが落ちる）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Page>
      {/* Konsta の title はただのテキストになるので、見出しとして扱われるよう h1 を渡す */}
      <Navbar title={<h1 className="truncate text-inherit">{TOURNAMENT_NAME}</h1>} />
      <TabNav />
      {children}
    </Page>
  );
}
