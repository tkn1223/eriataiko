/**
 * チームの色・部の色の決めごと。**全画面でここ 1 か所だけ**。DB も画面も触らない純粋な計算。
 *
 * 入場画面・myページ・結果LIVE・進行表・対戦表が、それぞれ「チーム番号 → 色」
 * 「部 → 色」の対応表をコピーして持っていて、食い違っていた
 * （5 チーム目の扱いが 2 通り、扱える部の数が 3 と 6 の 2 通り。PR #56 レビュー）。
 * 色の決めごとを変えたいときは、ここだけを直す。
 *
 * **Tailwind はクラス名を「文字列として」ソースから探して CSS を作る。**
 * `bg-team-${n}` のように組み立てると見つけられず、色が付かない。
 * だから対応表はどれも完全なクラス名で書く。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md の「2026-10-04 の書き直し」
 */

// ---------------------------------------------------------------------
// チームの色（globals.css の --color-team-1〜4）
// ---------------------------------------------------------------------

/** 色が用意してあるチーム番号。表（teams.team_number）も 1〜4 しか受け付けない。 */
export type TeamNumber = 1 | 2 | 3 | 4;

const TEAM_BG_CLASS: Record<TeamNumber, string> = {
  1: 'bg-team-1',
  2: 'bg-team-2',
  3: 'bg-team-3',
  4: 'bg-team-4',
};

/** チームに入っていない人（試合に出ない入力係など）の色。枠線と同じ薄い色。 */
const NO_TEAM_BG_CLASS = 'bg-hairline';

/** チームの色が付く番号か。薄い色の上に白い文字を載せると読めないので、画面側がそれを見分けるのに使う。 */
export function hasTeamColor(teamNumber: number | null): boolean {
  return teamNumber !== null && teamNumber in TEAM_BG_CLASS;
}

/**
 * チーム番号 → 背景色のクラス名。
 * チームに入っていない（null）人は薄い色。1〜4 に無い番号も、別のチームと
 * 同じ色にならないよう薄い色にする（1 番の色に折り返さない）。
 */
export function teamBgClass(teamNumber: number | null): string {
  return hasTeamColor(teamNumber) ? TEAM_BG_CLASS[teamNumber as TeamNumber] : NO_TEAM_BG_CLASS;
}

// ---------------------------------------------------------------------
// 部の文字と色（globals.css の --color-class-1〜6）
// ---------------------------------------------------------------------

/** 色が用意してある部の数。 */
export const CLASS_COLOR_COUNT = 6;

/** 部の色の番号（1〜6）。並び順（`divisions.sort_order`）の何番目かで決まる。 */
export type ClassColorNumber = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 画面に出す部。**出す文字（name）と色の番号を分けて持つ。**
 * 文字は `divisions.name` をそのまま出す（大会ごとに「1部」が「A級」になる）。
 * 色は名前ではなく並び順で決める。名前で決めると、名前を変えた年に色が付かなくなる。
 */
export type ClassLabel = { name: string; colorNumber: ClassColorNumber };

const CLASS_COLOR_CLASSES: Record<ClassColorNumber, { text: string; tint: string; dot: string }> = {
  1: { text: 'text-class-1', tint: 'bg-class-1-bg', dot: 'bg-class-1' },
  2: { text: 'text-class-2', tint: 'bg-class-2-bg', dot: 'bg-class-2' },
  3: { text: 'text-class-3', tint: 'bg-class-3-bg', dot: 'bg-class-3' },
  4: { text: 'text-class-4', tint: 'bg-class-4-bg', dot: 'bg-class-4' },
  5: { text: 'text-class-5', tint: 'bg-class-5-bg', dot: 'bg-class-5' },
  6: { text: 'text-class-6', tint: 'bg-class-6-bg', dot: 'bg-class-6' },
};

/**
 * 部の色のクラス名。
 * - text: 文字色（丸チップの文字）
 * - tint: 薄い背景色（丸チップの地）
 * - dot: 濃い背景色（小さい丸印）
 */
export function classColorClasses(colorNumber: ClassColorNumber) {
  return CLASS_COLOR_CLASSES[colorNumber];
}

/**
 * 並び順の何番目（0 始まり）の部がどの色か。
 * **7 部目以降は 6 番目の色で止める**（色を使い回して別の部と同じ色にするより、
 * 「ここから先は同じ色」のほうが壊れ方が分かりやすい。色は足せば増やせる）。
 */
export function classColorNumberAt(index: number): ClassColorNumber {
  return (Math.min(Math.max(index, 0), CLASS_COLOR_COUNT - 1) + 1) as ClassColorNumber;
}

/**
 * 試合の部が、その大会の部の表に見つからなかったときの代わり。
 * 通常は起きない（試合の部は必ずその大会の部）。起きたとき別の部（1部など）に
 * 見えると誤解を生むので、部の名前を偽らず、色も目立たない 6 番目にする。
 */
export const UNKNOWN_CLASS_LABEL: ClassLabel = { name: '部不明', colorNumber: 6 };

/** 部の名前と並び順（`divisions.name` と `divisions.sort_order`）。ラベル付けにはこれで足りる。 */
export type DivisionRow = { id: string; name: string; sortOrder: number };

/** `divisions.sort_order` の小さい順に色を当てる。文字は `divisions.name`。 */
export function classLabelsByDivisionId(divisions: DivisionRow[]): Map<string, ClassLabel> {
  const sorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const labelById = new Map<string, ClassLabel>();
  sorted.forEach((division, index) => {
    labelById.set(division.id, { name: division.name, colorNumber: classColorNumberAt(index) });
  });
  return labelById;
}
