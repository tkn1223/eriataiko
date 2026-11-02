/**
 * 「（◯◯ 棄権）」の小さな添え書き。
 * 棄権した側は点数で勝っていても負けになるので、勝ちが相手になっている理由を見せる。
 * 経緯: docs/specs/2026-10-11-retire-match.md
 */
export function RetiredNote({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="text-[11px] font-bold break-words text-gray-500">{`（${names.join('・')} 棄権）`}</span>
  );
}
