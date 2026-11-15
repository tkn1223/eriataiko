'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * 画面の上のバー（大会名の行）の右端に、その画面だけの短い一言を出すための差し込み口。
 *
 * バーは全画面共通の外枠（`app-shell.tsx`）が持っていて、各画面（page）からは直接さわれない。
 * そこで、外枠が「右端に何を出すか」を覚える入れ物を配り、画面は `NavbarRight` を描くだけで
 * そこに載せる。画面が閉じれば（別のタブに移れば）右端は空に戻る。
 * 使っていない画面のバーは何も変わらない（右端の欄そのものを作らない）。
 */
export const NavbarRightSetterContext = createContext<((content: ReactNode) => void) | null>(null);

export function NavbarRight({ children }: { children: ReactNode }) {
  const setContent = useContext(NavbarRightSetterContext);
  useEffect(() => {
    setContent?.(children);
    return () => setContent?.(null);
  }, [children, setContent]);
  return null;
}
