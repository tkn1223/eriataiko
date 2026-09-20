import { redirect } from 'next/navigation';
import { AppShell } from '@/ui/app-shell';
import { TOURNAMENT_NAME } from '@/config/tournament';
import { findCurrentCompetition } from '@/db/competition';
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
 * これは**守りではなく入口の案内**。書き込みは requirePlayer() が別に
 * 止めており、読み取りは元々誰でも見てよいデータ（docs/security.md）。
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  if (!(await getSession())) redirect('/enter');

  return <AppShell title={await headerTitle()}>{children}</AppShell>;
}

/**
 * ヘッダーに出す大会名。読めなければ控えの文字を出す。
 *
 * **ここで落とさない。** 失敗をそのまま投げると、ヘッダーのために
 * メニュー付きの画面が全部真っ白になる。つながらないことは各ページが
 * 日本語で知らせるので、外枠は控えの文字で立っていればよい。
 */
async function headerTitle(): Promise<string> {
  try {
    return (await findCurrentCompetition())?.name ?? TOURNAMENT_NAME;
  } catch {
    return TOURNAMENT_NAME;
  }
}
