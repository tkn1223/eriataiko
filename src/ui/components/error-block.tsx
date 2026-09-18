'use client';

import type { ReactNode } from 'react';
import { Block, BlockTitle } from 'konsta/react';

/**
 * エラーの案内。**見出し・本文・補足を呼ぶ側が決める。**
 *
 * 前は見出しが「Supabase に繋がりません」固定で、`.env.local` の案内も
 * 常に出ていた。「本当につながらない」（開発者向け）と「大会や登録が
 * 見つからない」（選手向け）は原因も伝える相手も違うので、呼ぶ側で
 * 見出しと補足を選べるようにする（PR #53 レビュー指摘4）。
 * 開発者向けの「つながらない」は `connection-error-block.tsx` にまとめてある。
 */
export function ErrorBlock({
  heading,
  message,
  hint,
}: {
  heading: string;
  message: string;
  hint?: ReactNode;
}) {
  return (
    <>
      <BlockTitle>{heading}</BlockTitle>
      <Block strong inset>
        <p className="mb-2 text-sm break-words">{message}</p>
        {hint ? <p className="text-sm opacity-60">{hint}</p> : null}
      </Block>
    </>
  );
}
