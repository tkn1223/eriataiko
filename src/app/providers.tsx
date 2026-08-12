'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { App } from 'konsta/react';

/**
 * Konsta UI のルート。
 *
 * iOS 端末では iOS テーマ、それ以外は Material テーマにして
 * 「その端末のネイティブアプリっぽい手触り」に寄せる。
 *
 * UA はサーバー側では分からないので、SSR は material 固定 →
 * ハイドレーション後に実際の端末に合わせて切り替える。
 * useSyncExternalStore を使うと、この「サーバーとクライアントで値が違う」を
 * React が正式に面倒を見てくれる（hydration mismatch にならない）。
 */

/** UA は変化しないので購読不要。解除関数だけ返す。 */
const subscribe = () => () => {};

const getServerTheme = (): 'ios' | 'material' => 'material';

const getClientTheme = (): 'ios' | 'material' => {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isIOS ? 'ios' : 'material';
};

export function Providers({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getClientTheme, getServerTheme);

  return (
    <App theme={theme} safeAreas>
      {children}
    </App>
  );
}
