/**
 * 画面上部のタブ。ここに 1 行足すと、そのままナビに出る。
 *
 * href とページとフォルダは 1 対 1 に対応させる:
 *   /courts → src/app/(app)/courts/page.tsx → src/ui/courts/
 */
export const TABS = [
  { href: '/courts', label: '現在' },
  { href: '/standings', label: '順位表' },
  { href: '/bracket', label: '対戦表' },
  { href: '/matches', label: '全試合' },
  { href: '/me', label: 'myページ' },
] as const;

export type TabHref = (typeof TABS)[number]['href'];
