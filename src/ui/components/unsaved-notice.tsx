/**
 * 「入れた点はまだ保存されません」の注意書き。
 * 得点を押す前に必ず目に入る位置と色で出すことが大事なので、
 * 進行表・結果LIVE の両方で同じ見た目を 1 か所にまとめる。
 */
export function UnsavedNotice() {
  return (
    <p className="text-accent bg-accent-soft rounded-[10px] px-3 py-2 text-[12px] font-extrabold">
      入れた点はまだ保存されません（画面を閉じると消えます）
    </p>
  );
}
