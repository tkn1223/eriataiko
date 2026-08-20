/**
 * 「あなたの試合」の印。
 * 進行表・結果LIVE の両方で同じ見た目を使うので、ここに 1 か所だけ置く。
 */
export function YouTag() {
  return (
    <span className="bg-accent shrink-0 rounded-[5px] px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-white">
      あなたの試合
    </span>
  );
}
