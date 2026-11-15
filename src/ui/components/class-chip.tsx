import { classColorClasses, type ClassLabel } from '@/domain/class-labels';

/**
 * 部の丸チップ。文字は部の名前、色は並び順で決まる（`src/domain/class-labels.ts`）。
 * 進行表・結果LIVE の両方で同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function ClassChip({
  classLabel,
  large = false,
}: {
  classLabel: ClassLabel;
  /**
   * 試合速報のカード用: 文字を 12px・太さ 700 にする（見本の数値。枠線は付けない）。
   * 進行表は今までの見た目のまま。
   */
  large?: boolean;
}) {
  const colors = classColorClasses(classLabel.colorNumber);
  const size = large
    ? 'px-2.5 py-0.5 text-[12px] font-bold'
    : 'px-2 py-0.5 text-[10px] font-extrabold';
  return (
    <span className={`shrink-0 rounded-full ${size} ${colors.text} ${colors.tint}`}>
      {classLabel.name}
    </span>
  );
}
