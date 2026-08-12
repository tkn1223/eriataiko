'use client';

import type { ReactNode } from 'react';
import { Navbar, Page } from 'konsta/react';

/**
 * タブなしの単独画面用の外枠（入場画面など）。
 * Server Component から Konsta を直接 import できないので、これを挟む。
 */
export function PlainPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page>
      <Navbar title={title} />
      {children}
    </Page>
  );
}
