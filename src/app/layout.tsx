import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'バドミントン大会 進行管理',
  description: 'コート進行表と勝ち上がりトーナメント表',
  // 大会関係者だけが見るページなので検索させない
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '大会進行',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 得点ボタンの誤ダブルタップでズームさせない
  maximumScale: 1,
  userScalable: false,
  // ノッチ端末で Konsta の safe-areas を効かせるのに必須
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
