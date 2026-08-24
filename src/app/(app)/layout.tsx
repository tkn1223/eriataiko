import { redirect } from 'next/navigation';
import { AppShell } from '@/ui/app-shell';
import { getSession } from '@/server/session';

/**
 * メニュー付き画面すべての外枠。
 *
 * **入場していない人はここで入場画面へ送る。** 5 つのタブはすべてこの
 * レイアウトの下にあるので、1 か所で足りる。`/enter` はこの外にあるため、
 * 追い返し続ける輪にはならない。
 *
 * **観戦者も「入場した人」として通す。** 観戦の入口を押した人が大会の画面を
 * 見られないと、その入口が意味を持たない。
 *
 * これは**守りではなく入口の案内**。書き込みは requireOperator() が別に
 * 止めており、読み取りは元々誰でも見てよいデータ（docs/security.md）。
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  if (!(await getSession())) redirect('/enter');

  return <AppShell>{children}</AppShell>;
}
