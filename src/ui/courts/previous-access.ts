import type { ScorerView } from '@/ui/courts/scorer-view';

/**
 * 1 つ前の試合の行と［直す］を、誰に出すか（仕様 docs/specs/2026-11-15-courts-redesign.md の「決めたこと」6）。
 *
 * 出すのは次の人だけ。
 * - その 1 つ前の試合に出た選手
 * - いまそのコートの試合の担当（自分）。「いまの担当だけ」にすると、コートの最後の試合が終わったときに
 *   誰も直せなくなるので、出た選手も入れてある
 *
 * **画面に出す人を絞るだけ。** 入口（API）は今までどおり誰が押しても受け付け、押した人が担当になる。
 *
 * 例外: 絞った相手でなくても、その 1 つ前の試合について保存の知らせ（断られた点・取り消せなかった等）が
 * 残っている選手には、知らせを消さないために行だけ出す（［直す］は出さない）。
 */
export function previousRowAccess(input: {
  /** 選手として入った人か（観戦者は false）。 */
  canInput: boolean;
  /** その 1 つ前の試合に出た選手か（`PreviousMatch.isMine`）。 */
  playedInPrevious: boolean;
  /** いまそのコートの試合（進行中、無ければ次）の担当の見え方。その試合が無ければ null。 */
  scorerOfCurrent: ScorerView['kind'] | null;
  /** その 1 つ前の試合について、画面に出す保存の知らせがあるか。 */
  hasNoticeAboutPrevious: boolean;
}): { showRow: boolean; showFixButton: boolean } {
  if (!input.canInput) return { showRow: false, showFixButton: false };
  const showFixButton = input.playedInPrevious || input.scorerOfCurrent === 'mine';
  return { showRow: showFixButton || input.hasNoticeAboutPrevious, showFixButton };
}
