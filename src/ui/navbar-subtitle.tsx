'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/**
 * 上の帯の、大会名の下に、その画面だけの短い一言を出すための差し込み口。
 *
 * 帯は全画面共通の外枠（`app-shell.tsx`）が持っていて、各画面（page）からは直接さわれない。
 * そこで、外枠が「何を出すか」を覚える入れ物を配り、画面は `NavbarSubtitle` を描くだけで
 * そこに載せる。画面が閉じれば（別のタブに移れば）空に戻る。
 * 使っていない画面の帯は大会名だけで、何も変わらない。
 */
export const NavbarSubtitleSetterContext = createContext<((content: ReactNode) => void) | null>(
  null
);

export function NavbarSubtitle({ children }: { children: ReactNode }) {
  const setContent = useContext(NavbarSubtitleSetterContext);
  useEffect(() => {
    setContent?.(children);
    return () => setContent?.(null);
  }, [children, setContent]);
  return null;
}
