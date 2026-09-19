/**
 * 注意書きの帯。得点を押す前に必ず目に入る位置と色で出すことが大事なので、
 * 進行表・結果LIVE の両方で同じ見た目を 1 か所にまとめる。
 *
 * 文言は呼び出し側から渡せる（1-b で結果LIVE の文言が「試合の終了はまだ記録されません」に
 * 変わったが、進行表（`src/ui/matches/score-sheet.tsx`）は今までの文言のまま使う）。
 */
const DEFAULT_TEXT = '入れた点はまだ保存されません（画面を閉じると消えます）';

export function UnsavedNotice({ text = DEFAULT_TEXT }: { text?: string }) {
  return (
    <p className="text-accent bg-accent-soft rounded-[10px] px-3 py-2 text-[12px] font-extrabold">
      {text}
    </p>
  );
}
