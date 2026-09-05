import Link from 'next/link';

/**
 * 観戦者が /me を開いたときの案内。
 *
 * 選手として名前を選んでいないので、成績も試合一覧も出せない。
 * 見た目は `src/ui/me/my-page.tsx` の見出し部（丸アバター＋名前）に揃える。
 */
export function ViewerNotice() {
  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="mb-5 flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gray-400 text-[26px] font-black text-white"
        >
          観
        </div>
        <div className="min-w-0">
          <p className="text-[22px] font-black break-words">観戦モード</p>
          <p className="text-[13px] font-bold break-words text-gray-500">
            名前を登録すると「自分の試合」が見られます
          </p>
        </div>
      </div>

      <Link
        href="/enter"
        className="flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-bold"
      >
        選手として入り直す
      </Link>
    </div>
  );
}
