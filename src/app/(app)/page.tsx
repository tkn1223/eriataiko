import { redirect } from 'next/navigation';

/**
 * トップページは「現在」に飛ばすだけ。
 *
 * こうしておくと、5 つのタブすべてが URL を持ち、
 * `src/ui/<画面名>/` と 1 対 1 で対応する（例外を覚えなくて済む）。
 */
export default function RootPage() {
  redirect('/courts');
}
