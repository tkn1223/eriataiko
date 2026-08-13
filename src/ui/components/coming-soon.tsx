'use client';

import { Block, BlockTitle } from 'konsta/react';

/** まだ作っていない画面のプレースホルダ。 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <BlockTitle>{title}</BlockTitle>
      <Block strong inset className="text-center">
        <p className="font-bold">準備中！！</p>
        <p className="mt-1 text-sm opacity-60">{description}</p>
      </Block>
    </>
  );
}
