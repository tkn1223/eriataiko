import { classColorClasses, type ClassLabel } from '@/domain/class-labels';

/**
 * 部の丸チップ。文字は部の名前、色は並び順で決まる（`src/domain/class-labels.ts`）。
 * 進行表・結果LIVE の両方で同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function ClassChip({ classLabel }: { classLabel: ClassLabel }) {
  const colors = classColorClasses(classLabel.colorNumber);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${colors.text} ${colors.tint}`}
    >
      {classLabel.name}
    </span>
  );
}
