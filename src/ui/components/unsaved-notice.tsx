/**
 * 注意書きの帯。得点を押す前に必ず目に入る位置と色で出すことが大事なので、
 * 見た目を 1 か所にまとめる。いまは進行表（`src/ui/matches/score-sheet.tsx`）が使う。
 *
 * 結果LIVE は、試合の終了もデータベースに記録されるようになったので、この帯を出さない。
 */
export function UnsavedNotice() {
  return (
    <p className="text-accent bg-accent-soft rounded-[10px] px-3 py-2 text-[12px] font-extrabold">
      入れた点はまだ保存されません（画面を閉じると消えます）
    </p>
  );
}
