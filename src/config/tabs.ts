/**
 * 画面下のメニュー。ここに 1 行足すと、そのままメニューに出る。
 *
 * href とページとフォルダは 1 対 1 に対応させる:
 *   /courts → src/app/(app)/courts/page.tsx → src/ui/courts/
 *
 * 絵文字を使うのは、アイコン用の画像やフォントを読み込まずに済ませるため
 * （体育館の電波が細いので、追加の通信を増やさない）。
 */
export const TABS = [
  { href: '/courts', label: '結果LIVE', icon: '🔴' },
  { href: '/matches', label: '進行表', icon: '🕐' },
  { href: '/bracket', label: '対戦表', icon: '🏸' },
  { href: '/me', label: 'myページ', icon: '👤' },
] as const;

export type TabHref = (typeof TABS)[number]['href'];
