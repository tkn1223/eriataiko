import { ErrorBlock } from '@/ui/components/error-block';

/**
 * 「Supabase に本当につながらない」ときの案内（開発者向け）。原因を隠さず画面に出す。
 *
 * 入場画面（`src/app/enter/page.tsx`）とマイページ（`src/app/(app)/me/page.tsx`）の
 * どちらも、接続そのものが失敗したときはこれを使う。
 *
 * **このファイルには `'use client'` を付けない。** 付いたファイルから文言や JSX を
 * 書き出すと、Server Component からは値ではなく「ブラウザ側の部品への参照」に見え、
 * 部品にそのまま渡したときしか正しく動かない。見出しと補足はここで組み立てて渡す。
 */
export function ConnectionErrorBlock({ message }: { message: string }) {
  return (
    <ErrorBlock
      heading="Supabase に繋がりません"
      message={message}
      hint={
        <>
          <code>.env.local</code> の <code>NEXT_PUBLIC_SUPABASE_URL</code> /{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> と、マイグレーション（
          <code>npm run db:push</code>）の適用状況を確認してください。
        </>
      }
    />
  );
}
