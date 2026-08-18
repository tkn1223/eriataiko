'use client';

import { type ReactNode, useEffect } from 'react';

type Props = {
  open: boolean;
  /** 見出しに付けた id。読み上げのときに「どのシートか」を伝えるために使う。 */
  labelledBy: string;
  /** 見出し（左側）。右側の「閉じる ✕」はこの部品が出す。 */
  header: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 下からせり上がる共通のシート（対戦表の対戦詳細・進行表の得点入力）。
 * 暗幕・Esc・背景タップ・背後を動かさない指の制御を 1 か所にまとめる。
 * 同じ作りを 2 か所に書くと、片方だけ直して挙動がずれるため。
 */
export function BottomSheet({ open, labelledBy, header, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // touch-none: 暗い部分をなぞってもページを動かさない。Chromium では動かないことを
    // 実測できたが、iOS Safari では背後が動く作りなので、指の操作そのものを受け付けない。
    // （背後の縦スクロールは body ではなく Konsta の Page が持つので、body を止めても効かない）
    <div className="fixed inset-0 z-30 flex touch-none items-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="背景"
        className="bg-ink/45 absolute inset-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        // シートの中身が長いときはここだけ縦に動かす（overscroll-contain で背後には伝えない）。
        // 下の余白は、iPhone のホームバーに最後の行が隠れないぶんを足す。
        className="relative z-10 max-h-[78vh] w-full touch-pan-y overflow-y-auto overscroll-contain rounded-t-[20px] bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">{header}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-gray-300 px-3 text-sm font-bold whitespace-nowrap"
          >
            閉じる ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
