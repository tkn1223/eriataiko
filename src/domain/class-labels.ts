/**
 * 部（1部/2部/3部）のラベル決めと、チーム色（1〜4）の折り返し。DB も画面も触らない純粋な計算。
 *
 * マイページ（`src/usecases/build-my-page-view.ts`、PR #53）で先に決まったやり方を、
 * 結果LIVE（`src/usecases/build-courts-view.ts`）でもそのまま使う。
 * 2 か所で同じ判断がコピーされて食い違うことを避けるため、ここに 1 か所だけ置く
 * （docs/specs/2026-09-19-courts-real-data.md の「要点」）。
 */

import type { ClassLabel } from '@/ui/components/class-chip';

export type { ClassLabel };

/** 部の並び順（`divisions.sort_order` と `id`）。ラベル付けにはこれだけで足りる。 */
export type DivisionSortRow = { id: string; sortOrder: number };

const CLASS_LABELS: readonly ClassLabel[] = ['1部', '2部', '3部'];

/**
 * `divisions.sort_order` の小さい順に 1部/2部/3部を当てる。4 つ目以降は 3部。
 * 部の名前ではなく並び順で決める（AGENTS.md / 各仕様書の「決めたこと」と同じ考え方）。
 */
export function classLabelsByDivisionId(divisions: DivisionSortRow[]): Map<string, ClassLabel> {
  const sorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const labelById = new Map<string, ClassLabel>();
  sorted.forEach((division, index) => {
    const label = CLASS_LABELS[index] ?? CLASS_LABELS[CLASS_LABELS.length - 1];
    labelById.set(division.id, label);
  });
  return labelById;
}

/** チーム色は 1〜4 の 4 色のみ（globals.css の --color-team-1〜4）。 */
export type TeamNumber = 1 | 2 | 3 | 4;

/** `teams.team_number` を 1〜4 の 4 色に折り返す（5 チーム目以降は 1 から繰り返す）。 */
export function foldTeamNumber(teamNumber: number | null): TeamNumber | null {
  if (teamNumber === null) return null;
  return (((teamNumber - 1) % 4) + 1) as TeamNumber;
}
