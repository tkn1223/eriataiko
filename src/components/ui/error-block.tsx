'use client';

import { Block, BlockTitle } from 'konsta/react';

/** Supabase に繋がらないときの案内。原因を隠さず画面に出す。 */
export function ErrorBlock({ message }: { message: string }) {
  return (
    <>
      <BlockTitle>Supabase に繋がりません</BlockTitle>
      <Block strong inset>
        <p className="mb-2 text-sm break-words">{message}</p>
        <p className="text-sm opacity-60">
          <code>.env.local</code> の <code>NEXT_PUBLIC_SUPABASE_URL</code> /{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> と、マイグレーション（
          <code>npm run db:push</code>）の適用状況を確認してください。
        </p>
      </Block>
    </>
  );
}
