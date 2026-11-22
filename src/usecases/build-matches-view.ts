import { classLabelsByDivisionId } from '@/domain/class-labels';
import {
  currentStageProgress,
  toCourtMatch,
  type CourtsViewDivisionRow,
  type CourtsViewMatchRow,
  type CourtsViewParticipantRow,
  type CourtsViewStageRow,
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
  /** 段ごとの試合数・終了数（帯の小見出し「予選リーグ 27/72 試合」用。試合速報と同じ数え方）。 */
  stages: CourtsViewStageRow[];
  /** その大会の参加者（入力担当の名前を引く元）。 */
  participants: CourtsViewParticipantRow[];
  /** 読む上限を超えた（読み切れていない）。黙って欠けさせず、画面で知らせる。 */
  truncated: boolean;
};

export type MatchesView = {
  board: BoardMatch[];
  /** いまの段の名前（`stages.name`）。段が無ければ空文字。 */
  stageLabel: string;
  completedMatches: number;
  totalMatches: number;
  /**
   * 参加者の id → 入力担当として出す名前（「ケイ（もりの）」。チームが無ければ名前だけ）。
   * 試合の `scorerParticipantId` から引く。
   */
  scorerNames: Record<string, string>;
  truncated: boolean;
};

/** 画面に出す入力担当の名前。「（チーム）」の形は進行表の詳しい画面だけのもの（試合速報は scorerLabel）。 */
function scorerDisplayName(person: CourtsViewParticipantRow): string {
  return person.teamName ? `${person.playerName}（${person.teamName}）` : person.playerName;
}

export function buildMatchesView(input: MatchesViewInput): MatchesView {
  const classLabelById = classLabelsByDivisionId(input.divisions);

  const progress = currentStageProgress(input.stages, input.matches);

  return {
    board: input.matches.map((match) => toCourtMatch(match, input.myParticipantId, classLabelById)),
    stageLabel: progress.label,
    completedMatches: progress.completedMatches,
    totalMatches: progress.totalMatches,
    scorerNames: Object.fromEntries(
      input.participants.map((person) => [person.participantId, scorerDisplayName(person)])
    ),
    truncated: input.truncated,
  };
}
