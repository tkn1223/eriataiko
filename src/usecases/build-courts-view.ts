import {
  classLabelsByDivisionId,
  UNKNOWN_CLASS_LABEL,
  type ClassLabel,
  type DivisionRow,
} from '@/domain/class-labels';
import type { GameScore } from '@/domain/scoring';
import { deriveCourts } from '@/ui/courts/derive-courts';
import type {
  Court,
  CourtMatch,
  CourtMatchStatus,
  CourtsEmptyReason,
  CourtTeam,
} from '@/ui/courts/types';

/**
 * 結果LIVE（`/courts`）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 * 層の分け方は AGENTS.md の「db が読む → usecases が画面の形に組む → page.tsx は呼ぶだけ」に従う
 * （読み取りは `src/db/courts.ts`）。
 *
 * 入力は 3 種類の読み込みに分かれている（大会が進むほど重くならないように）。
 * - `matches` … **進行中（live）と未実施（waiting）の試合だけ**。名前・得点つき。コートのカード用。
 * - `previousMatches` … 最近終わった試合（新しい順）。コートごとの「1 つ前」を選ぶ元。終わった試合を
 *   全部は読まない（上限つき）。
 * - `stages[].totalMatches` / `doneMatches` … 段ごとの**件数だけ**。「◯/◯ 試合消化」用。
 */

export type CourtsViewDivisionRow = DivisionRow;

export type CourtsViewStageRow = {
  id: string;
  name: string;
  sortOrder: number;
  /** その段の全試合数（状態を問わない）。数えただけで、試合の行は読んでいない。 */
  totalMatches: number;
  /** その段の終了（done）の試合数。 */
  doneMatches: number;
};

export type CourtsViewPlayerRow = { participantId: string; orderInPair: number; name: string };

/** 対戦の片側（`matchups.side_x_*`）。チームが決まっていなければ `players` は空。 */
export type CourtsViewSideRow = {
  /** `teams.team_number`（そのまま。色の対応は `src/domain/class-labels.ts`）。決まっていなければ null。 */
  teamNumber: number | null;
  /** `matchups.side_x_slot_label`。決まっていれば null。 */
  slotLabel: string | null;
  players: CourtsViewPlayerRow[];
};

export type CourtsViewGameScoreRow = GameScore;

export type CourtsViewMatchRow = {
  matchId: string;
  /** `matches.status`。 */
  status: string;
  maxGameCount: number;
  courtNumber: number | null;
  orderInCourt: number | null;
  /** `matches.finished_at`（ISO 8601）。終わっていない試合は null。 */
  finishedAt: string | null;
  divisionId: string;
  stageId: string;
  /** `matchups.round_name`。例: '予選 1回戦'。 */
  roundName: string;
  sideA: CourtsViewSideRow;
  sideB: CourtsViewSideRow;
  gameScores: CourtsViewGameScoreRow[];
};

export type CourtsViewInput = {
  /** 選手として入った人の participants.id。観戦者・未入場は null（isMine は常に false）。 */
  myParticipantId: string | null;
  divisions: CourtsViewDivisionRow[];
  stages: CourtsViewStageRow[];
  /** live と waiting の試合だけ。 */
  matches: CourtsViewMatchRow[];
  /**
   * 最近終わった試合（終了の時刻つき）。ここからコートごとに一番新しい 1 つを「1 つ前」に選ぶ。
   * 並び順は問わない（この関数が時刻で選ぶ）。
   */
  previousMatches: CourtsViewMatchRow[];
  /** 読む上限を超えた（読み切れていない）。黙って欠けさせず、画面で知らせる。 */
  truncated: boolean;
};

export type CourtsView = {
  /** いまの段のラベル（`stages.name`）。段が 1 つも無ければ空文字。 */
  stageLabel: string;
  /** いまの段の done の試合数。 */
  completedMatches: number;
  /** いまの段の全試合数。 */
  totalMatches: number;
  /**
   * 画面が持つ元データ。コートのカードはここから組み立てる（`deriveCourts`）。
   * 届いた変化を当てたあとも同じ関数でカードにするため、画面にはカードではなくこちらを渡す。
   */
  board: CourtMatch[];
  courts: Court[];
  /**
   * 進行中・未実施の試合が入ったコートが 1 つも無いときだけ入る。
   * 最後の試合が終わったコートは 1 つ前を出すためにカードが残るので、案内はカードと一緒に出ることがある。
   */
  emptyReason: CourtsEmptyReason | null;
  truncated: boolean;
};

function isMineSide(side: CourtsViewSideRow, myParticipantId: string | null): boolean {
  if (!myParticipantId) return false;
  return side.players.some((p) => p.participantId === myParticipantId);
}

function toCourtTeam(side: CourtsViewSideRow): CourtTeam {
  return {
    teamNumber: side.teamNumber,
    players: [...side.players].sort((a, b) => a.orderInPair - b.orderInPair).map((p) => p.name),
    slotLabel: side.slotLabel,
  };
}

function classLabelOf(
  match: CourtsViewMatchRow,
  classLabelById: Map<string, ClassLabel>
): ClassLabel {
  // classLabelById は divisions から作った、通常は必ず値が入る表。
  // 万一 division がその大会に無ければ、別の部に見えないよう「部不明」にする。
  return classLabelById.get(match.divisionId) ?? UNKNOWN_CLASS_LABEL;
}

function toCourtMatch(
  match: CourtsViewMatchRow,
  myParticipantId: string | null,
  classLabelById: Map<string, ClassLabel>
): CourtMatch {
  return {
    matchId: match.matchId,
    // 画面に出す試合は live / waiting / done のどれか（表の check 制約で保証されている）
    status: match.status as CourtMatchStatus,
    courtNumber: match.courtNumber,
    orderInCourt: match.orderInCourt,
    finishedAt: match.finishedAt,
    reopened: false,
    classLabel: classLabelOf(match, classLabelById),
    roundLabel: match.roundName,
    teamA: toCourtTeam(match.sideA),
    teamB: toCourtTeam(match.sideB),
    isMine: isMineSide(match.sideA, myParticipantId) || isMineSide(match.sideB, myParticipantId),
    maxGameCount: match.maxGameCount,
    scores: match.gameScores,
  };
}

/**
 * 「いまの段」のラベルと消化数。**件数だけで決める**（試合の行は見ない）。
 *
 * 段を `sort_order` の大きい順に見て、waiting 以外の試合（終了か進行中）が 1 つでもある
 * 最初の段が「いまの段」。どの段にも無ければ、並び順が最初の段（仕様の「決めたこと」2）。
 * 「進行中があるか」は、コート用に読んだ live の試合から分かる。
 */
function currentStageProgress(
  stages: CourtsViewStageRow[],
  matches: CourtsViewMatchRow[]
): { label: string; completedMatches: number; totalMatches: number } {
  if (stages.length === 0) return { label: '', completedMatches: 0, totalMatches: 0 };

  const sortedAscending = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const stageIdsWithLiveMatch = new Set(
    matches.filter((m) => m.status === 'live').map((m) => m.stageId)
  );

  const currentStage =
    [...sortedAscending]
      .reverse()
      .find((stage) => stage.doneMatches > 0 || stageIdsWithLiveMatch.has(stage.id)) ??
    sortedAscending[0];

  return {
    label: currentStage.name,
    completedMatches: currentStage.doneMatches,
    totalMatches: currentStage.totalMatches,
  };
}

/** 0 枚の理由。`remainingMatches` は live と waiting の試合（コートが決まっていないものも含む）。 */
function emptyReasonOf(
  remainingMatches: CourtsViewMatchRow[],
  stages: CourtsViewStageRow[]
): CourtsEmptyReason {
  if (remainingMatches.length > 0) return 'courts-undecided';
  const hasAnyMatch = stages.some((stage) => stage.totalMatches > 0);
  return hasAnyMatch ? 'all-finished' : 'no-matches';
}

/** コートごとに、終了の時刻が一番新しい終わった試合を 1 つずつ選ぶ。 */
function newestFinishedPerCourt(previousMatches: CourtsViewMatchRow[]): CourtsViewMatchRow[] {
  const newestByCourt = new Map<number, CourtsViewMatchRow>();
  for (const match of previousMatches) {
    if (match.courtNumber === null || match.finishedAt === null) continue;
    const current = newestByCourt.get(match.courtNumber);
    if (!current || Date.parse(match.finishedAt) > Date.parse(current.finishedAt ?? '')) {
      newestByCourt.set(match.courtNumber, match);
    }
  }
  return [...newestByCourt.values()];
}

export function buildCourtsView(input: CourtsViewInput): CourtsView {
  const classLabelById = classLabelsByDivisionId(input.divisions);
  const progress = currentStageProgress(input.stages, input.matches);

  // 進行中・未実施の試合。念のため終わった試合が混ざっても使わない。
  const remainingMatches = input.matches.filter(
    (m) => m.status === 'live' || m.status === 'waiting'
  );

  // 画面に渡す元データ。コートごとの 1 つ前だけを足す（古い終わった試合は渡さない。
  // 画面に渡るデータは、そのまま通信量になる）。
  // コート用と 1 つ前の元は同時に別々に読むので、その間に終わった・取り消された試合は両方に入りうる。
  // 同じ試合が 2 つあると、届いた変化が片方にしか当たらず、進行中と 1 つ前に二重に出るので、
  // コート用のほうを残す（どちらが新しいかは分からないが、つながったときの読み直しで直る）。
  const remainingIds = new Set(remainingMatches.map((m) => m.matchId));
  const previousCandidates = input.previousMatches.filter(
    (m) => m.status === 'done' && !remainingIds.has(m.matchId)
  );
  const board = [...remainingMatches, ...newestFinishedPerCourt(previousCandidates)].map((match) =>
    toCourtMatch(match, input.myParticipantId, classLabelById)
  );
  const courts = deriveCourts(board);

  const hasCardWithMatch = courts.some(
    (court) => court.live !== null || court.next !== null || court.fixing.length > 0
  );

  return {
    stageLabel: progress.label,
    completedMatches: progress.completedMatches,
    totalMatches: progress.totalMatches,
    board,
    courts,
    emptyReason: hasCardWithMatch ? null : emptyReasonOf(remainingMatches, input.stages),
    truncated: input.truncated,
  };
}
