import Link from 'next/link';
import { PlainPage } from '@/ui/components/plain-page';
import { TABS } from '@/config/tabs';
import { TOURNAMENT_NAME } from '@/config/tournament';

/** 戻り先は、当日いちばん見られる画面（メニューの先頭）。 */
const HOME_TAB = TABS[0];

/**
 * 無い URL を開いたときの画面（アプリ全体に効く）。
 *
 * Next.js の標準は英語の "404 This page could not be found." で、
 * 体育館で見る人には何が起きたか伝わらないので日本語で出す。
 * 下のメニューが無い画面なので、戻り道のリンクを必ず 1 つ置く。
 */
export default function NotFound() {
  return (
    <PlainPage title={TOURNAMENT_NAME}>
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-[22px] font-black">ページがありません</h1>
        <p className="mt-3 text-[15px] font-bold text-gray-500">
          アドレスが変わったか、消えた画面です。
        </p>
        <Link
          href={HOME_TAB.href}
          className="bg-ink mt-6 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-extrabold text-white"
        >
          {HOME_TAB.label} へ戻る
        </Link>
      </div>
    </PlainPage>
  );
}
