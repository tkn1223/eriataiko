import { classLabelsByDivisionId } from '@/domain/class-labels';
import {
  toCourtMatch,
  type CourtsViewDivisionRow,
  type CourtsViewMatchRow,
} from '@/usecases/build-courts-view';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 進行表（`/matches`）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 * 層の分け方は結果LIVE と同じ（読み取りは `src/db/matches-board.ts`）。
 *
 * ここで作るのは**試合の一覧（`board`）だけ**。コートごとのカードと見出しの数は、
 * 届いた変化を当てたあとも同じ関数で作り直すので、画面の側（`derive-matches-courts.ts`）が
 * 一覧から組み立てる。試合 1 つの組み立ては結果LIVE と同じ `toCourtMatch`。
 */

export type MatchesViewInput = {
  /** 選手として入った人の participants.id。観戦者・未入場は null（isMine は常に false）。 */
  myParticipantId: string | null;
  divisions: CourtsViewDivisionRow[];
  /** いまの大会の全試合（終わった・進行中・これから）。 */
  matches: CourtsViewMatchRow[];
  /** 読む上限を超えた（読み切れていない）。黙って欠けさせず、画面で知らせる。 */
  truncated: boolean;
};

export type MatchesView = {
  board: BoardMatch[];
  truncated: boolean;
};

export function buildMatchesView(input: MatchesViewInput): MatchesView {
  const classLabelById = classLabelsByDivisionId(input.divisions);

  return {
    board: input.matches.map((match) => toCourtMatch(match, input.myParticipantId, classLabelById)),
    truncated: input.truncated,
  };
}
