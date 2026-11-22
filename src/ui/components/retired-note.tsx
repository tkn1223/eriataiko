/**
 * 「（◯◯ 棄権）」の添え書き。
 * 棄権した側は点数で勝っていても負けになるので、勝ちが相手になっている理由を見せる。
 * 経緯: docs/specs/2026-10-11-retire-match.md
 *
 * `className` は文字の大きさと色。省略すると小さい灰色（進行表・結果LIVE などの既存の見た目）。
 * 金の面に載せる myページは、濃い金に替えて渡す。
 */
export function RetiredNote({
  names,
  className = 'text-[11px] text-gray-500',
}: {
  names: string[];
  className?: string;
}) {
  if (names.length === 0) return null;
  return (
    <span className={`font-bold break-words ${className}`}>{`（${names.join('・')} 棄権）`}</span>
  );
}
