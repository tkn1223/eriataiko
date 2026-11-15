import { classColorClasses, type ClassLabel } from '@/domain/class-labels';

/**
 * 部の丸チップ。文字は部の名前、色は並び順で決まる（`src/domain/class-labels.ts`）。
 * 進行表・結果LIVE の両方で同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function ClassChip({
  classLabel,
  outlined = false,
}: {
  classLabel: ClassLabel;
  /** 試合速報のカード用: 少し大きく、丸い細い枠で囲む（進行表は今までの見た目のまま）。 */
  outlined?: boolean;
}) {
  const colors = classColorClasses(classLabel.colorNumber);
  const size = outlined ? 'px-2.5 py-0.5 text-[12px] font-bold' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`shrink-0 rounded-full ${outlined ? '' : 'font-extrabold'} ${size} ${colors.text} ${colors.tint}`}
    >
      {classLabel.name}
    </span>
  );
}
