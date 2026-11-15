/**
 * 画面下のメニュー。ここに 1 行足すと、そのままメニューに出る。
 *
 * href とページとフォルダは 1 対 1 に対応させる:
 *   /courts → src/app/(app)/courts/page.tsx → src/ui/courts/
 *
 * icon は印の名前（描くのは `src/ui/bottom-nav.tsx`。画像やフォントは読み込まず、インラインの SVG で描く。
 * 体育館の電波が細いので、追加の通信を増やさない）。
 */
export const TABS = [
  { href: '/courts', label: '試合速報', icon: 'live' },
  { href: '/matches', label: '進行表', icon: 'calendar' },
  { href: '/bracket', label: '対戦表', icon: 'tree' },
  { href: '/me', label: 'myページ', icon: 'user' },
] as const;

export type TabHref = (typeof TABS)[number]['href'];
