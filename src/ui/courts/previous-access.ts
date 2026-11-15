import type { ScorerView } from '@/ui/courts/scorer-view';

/**
 * 1 つ前の試合の行と［訂正］を、誰に出すか（仕様 docs/specs/2026-11-15-courts-redesign.md の「決めたこと」6）。
 *
 * 出すのは次の人だけ。
 * - その 1 つ前の試合に出た選手
 * - その 1 つ前の試合で入力担当だった人。試合に出ていない担当者が［試合終了］を押した直後は、
 *   次の試合の担当ではなくなるので、これが無いと押し間違えても自分では訂正できない
 * - いまそのコートの試合の担当（自分）。「いまの担当だけ」にすると、コートの最後の試合が終わったときに
 *   誰も直せなくなるので、出た選手も入れてある
 *
 * **画面に出す人を絞るだけ。** 入口（API）は今までどおり誰が押しても受け付け、押した人が担当になる。
 *
 * 例外: 絞った相手でなくても、その 1 つ前の試合について保存の知らせ（断られた点・取り消せなかった等）が
 * 残っている選手にも、行と［訂正］を出す（エラー文が「先に『訂正』を押して」と言うので、
 * 知らせだけ出してボタンが見えない人を作らない）。
 */
export function previousRowAccess(input: {
  /** 選手として入った人か（観戦者は false）。 */
  canInput: boolean;
  /** その 1 つ前の試合に出た選手か（`PreviousMatch.isMine`）。 */
  playedInPrevious: boolean;
  /** その 1 つ前の試合の記録上の入力担当（終了しても記録は残る）が自分か。記録が読めなければ false。 */
  wasScorerOfPrevious: boolean;
  /** いまそのコートの試合（進行中、無ければ次）の担当の見え方。その試合が無ければ null。 */
  scorerOfCurrent: ScorerView['kind'] | null;
  /** その 1 つ前の試合について、画面に出す保存の知らせがあるか。 */
  hasNoticeAboutPrevious: boolean;
}): { showRow: boolean; showFixButton: boolean } {
  if (!input.canInput) return { showRow: false, showFixButton: false };
  const show =
    input.playedInPrevious ||
    input.wasScorerOfPrevious ||
    input.scorerOfCurrent === 'mine' ||
    input.hasNoticeAboutPrevious;
  return { showRow: show, showFixButton: show };
}
