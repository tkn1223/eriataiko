/**
 * 画面上部のタブ。ここに 1 行足すと、そのままナビに出る。
 * ページ本体は src/app/(app)/<path>/page.tsx に置く。
 */
export const TABS = [
  { href: '/', label: '現在' },
  { href: '/standings', label: '順位表' },
  { href: '/bracket', label: '対戦表' },
  { href: '/matches', label: '全試合' },
  { href: '/me', label: 'myページ' },
] as const;

export type TabHref = (typeof TABS)[number]['href'];
