import { classLabelsByDivisionId, foldTeamNumber, type ClassLabel } from '@/domain/class-labels';
import type { GameScore } from '@/domain/scoring';
import type { Court, CourtTeam, LiveMatch, NextMatch } from '@/ui/courts/types';

/**
 * 結果LIVE（`/courts`）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-09-19-courts-real-data.md
 * 層の分け方は AGENTS.md の「db が読む → usecases が画面の形に組む → page.tsx は呼ぶだけ」に従う
 * （読み取りは `src/db/courts.ts`）。
 */

/** コートは常に 1〜8 面（仕様の「決めたこと」）。この定数 1 か所だけで決める。 */
export const COURT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type CourtsViewDivisionRow = { id: string; sortOrder: number };
export type CourtsViewStageRow = { id: string; name: string; sortOrder: number };

export type CourtsViewPlayerRow = { participantId: string; orderInPair: number; name: string };

/** 対戦の片側（`matchups.side_x_*`）。チームが決まっていなければ `players` は空。 */
export type CourtsViewSideRow = {
  /** `teams.team_number`（折り返す前の生の値）。決まっていなければ null。 */
  teamNumber: number | null;
  /** `matchups.side_x_slot_label`。決まっていれば null。 */
  slotLabel: string | null;
  players: CourtsViewPlayerRow[];
};

export type CourtsViewGameScoreRow = GameScore;

export type CourtsViewMatchRow = {
  matchId: string;
  /** `matches.status`。'waiting' | 'live' | 'done'。 */
  status: string;
  maxGameCount: number;
  courtNumber: number | null;
  orderInCourt: number | null;
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
  matches: CourtsViewMatchRow[];
};

export type CourtsView = {
  /** いまの段のラベル（`stages.name`）。段が 1 つも無ければ空文字。 */
  stageLabel: string;
  /** いまの段の done の試合数。 */
  completedMatches: number;
  /** いまの段の全試合数。 */
  totalMatches: number;
  courts: Court[];
};

function isMineSide(side: CourtsViewSideRow, myParticipantId: string | null): boolean {
  if (!myParticipantId) return false;
  return side.players.some((p) => p.participantId === myParticipantId);
}

function toCourtTeam(side: CourtsViewSideRow): CourtTeam {
  return {
    teamNumber: foldTeamNumber(side.teamNumber),
    players: [...side.players].sort((a, b) => a.orderInPair - b.orderInPair).map((p) => p.name),
    slotLabel: side.slotLabel,
  };
}

function classLabelOf(
  match: CourtsViewMatchRow,
  classLabelById: Map<string, ClassLabel>
): ClassLabel {
  // classLabelById は divisions から作った、通常は必ず値が入る表。
  // 万一 division がその大会に無ければ「決めていない部」の意味で 3部 に寄せる（/me と同じ扱い）。
  return classLabelById.get(match.divisionId) ?? '3部';
}

function toLiveMatch(
  match: CourtsViewMatchRow,
  myParticipantId: string | null,
  classLabelById: Map<string, ClassLabel>
): LiveMatch {
  return {
    matchId: match.matchId,
    classLabel: classLabelOf(match, classLabelById),
    roundLabel: match.roundName,
    teamA: toCourtTeam(match.sideA),
    teamB: toCourtTeam(match.sideB),
    isMine: isMineSide(match.sideA, myParticipantId) || isMineSide(match.sideB, myParticipantId),
    scores: match.gameScores,
    maxGameCount: match.maxGameCount,
  };
}

function toNextMatch(
  match: CourtsViewMatchRow,
  myParticipantId: string | null,
  classLabelById: Map<string, ClassLabel>
): NextMatch {
  return {
    matchId: match.matchId,
    classLabel: classLabelOf(match, classLabelById),
    roundLabel: match.roundName,
    teamA: toCourtTeam(match.sideA),
    teamB: toCourtTeam(match.sideB),
    isMine: isMineSide(match.sideA, myParticipantId) || isMineSide(match.sideB, myParticipantId),
    maxGameCount: match.maxGameCount,
  };
}

/** `order_in_court` が最小の 1 件を選ぶ。コート未定（null）は最後に回す。 */
function pickByOrderInCourt(matches: CourtsViewMatchRow[]): CourtsViewMatchRow | null {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort((a, b) => {
    const orderA = a.orderInCourt ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.orderInCourt ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
  return sorted[0];
}

function buildCourt(
  courtNumber: number,
  matches: CourtsViewMatchRow[],
  myParticipantId: string | null,
  classLabelById: Map<string, ClassLabel>
): Court {
  const onThisCourt = matches.filter((m) => m.courtNumber === courtNumber);
  const liveMatch = pickByOrderInCourt(onThisCourt.filter((m) => m.status === 'live'));
  const nextMatch = pickByOrderInCourt(onThisCourt.filter((m) => m.status === 'waiting'));

  return {
    courtNumber,
    live: liveMatch ? toLiveMatch(liveMatch, myParticipantId, classLabelById) : null,
    next: nextMatch ? toNextMatch(nextMatch, myParticipantId, classLabelById) : null,
  };
}

/**
 * 「いまの段」のラベルと消化数。
 *
 * 段を `sort_order` の大きい順に見て、waiting 以外の試合が 1 つでもある最初の段が「いまの段」。
 * どの段にも waiting 以外の試合が無ければ、並び順が最初の段（仕様の「決めたこと」2）。
 */
function currentStageProgress(
  stages: CourtsViewStageRow[],
  matches: CourtsViewMatchRow[]
): { label: string; completedMatches: number; totalMatches: number } {
  if (stages.length === 0) return { label: '', completedMatches: 0, totalMatches: 0 };

  const sortedAscending = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const startedStageIds = new Set(
    matches.filter((m) => m.status !== 'waiting').map((m) => m.stageId)
  );

  const currentStage =
    [...sortedAscending].reverse().find((stage) => startedStageIds.has(stage.id)) ??
    sortedAscending[0];

  const stageMatches = matches.filter((m) => m.stageId === currentStage.id);
  const completedMatches = stageMatches.filter((m) => m.status === 'done').length;

  return { label: currentStage.name, completedMatches, totalMatches: stageMatches.length };
}

export function buildCourtsView(input: CourtsViewInput): CourtsView {
  const classLabelById = classLabelsByDivisionId(input.divisions);
  const progress = currentStageProgress(input.stages, input.matches);

  const courts = COURT_NUMBERS.map((courtNumber) =>
    buildCourt(courtNumber, input.matches, input.myParticipantId, classLabelById)
  );

  return {
    stageLabel: progress.label,
    completedMatches: progress.completedMatches,
    totalMatches: progress.totalMatches,
    courts,
  };
}
