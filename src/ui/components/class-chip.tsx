export type ClassLabel = '1部' | '2部' | '3部';

const CLASS_TEXT_CLASS: Record<ClassLabel, string> = {
  '1部': 'text-class-1',
  '2部': 'text-class-2',
  '3部': 'text-class-3',
};

const CLASS_BG_CLASS: Record<ClassLabel, string> = {
  '1部': 'bg-class-1-bg',
  '2部': 'bg-class-2-bg',
  '3部': 'bg-class-3-bg',
};

/**
 * 部（1部/2部/3部）の丸チップ。
 * 進行表・結果LIVE の両方で同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function ClassChip({ classLabel }: { classLabel: ClassLabel }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${CLASS_TEXT_CLASS[classLabel]} ${CLASS_BG_CLASS[classLabel]}`}
    >
      {classLabel}
    </span>
  );
}
