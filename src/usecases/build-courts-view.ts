import type {
  ClassLabel,
  Court,
  CourtTeam,
  GameScore,
  LiveMatch,
  NextMatch,
  TeamNumber,
} from '@/ui/courts/types';

/**
 * `/courts`（結果LIVE）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-08-30-courts-live-scores.md
 */

export type CourtsViewGameScoreRow = {
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

export type CourtsViewPlayerRow = {
  playerId: string;
  name: string;
};

export type CourtsViewSideRow = {
  /**
   * DB の生の値（1〜4 のはずだが、まだ検証していない）。
   * 決勝トーナメントの空枠のように相手がまだ決まっていない側は null。
   */
  teamNumber: number | null;
  players: CourtsViewPlayerRow[];
};

export type CourtsViewMatchRow = {
  matchId: string;
  courtNumber: number;
  orderInCourt: number;
  /** `matches.status`。'waiting' | 'live' | 'done'。 */
  status: string;
  maxGameCount: number;
  /** `divisions.name`。まだ検証していない生の文字列。 */
  divisionName: string;
  /** `matchups.round_name`。例: '予選 1回戦'。 */
  roundName: string;
  teamA: CourtsViewSideRow;
  teamB: CourtsViewSideRow;
  gameScores: CourtsViewGameScoreRow[];
};

export type CourtsViewInput = {
  /** 入場している人の playerId。観戦者・未入場なら null（isMine は常に false になる）。 */
  currentPlayerId: string | null;
  /** court_number があり status が live/waiting の試合だけを渡す想定（念のためここでも絞る）。 */
  matches: CourtsViewMatchRow[];
};

const CLASS_LABELS: readonly ClassLabel[] = ['1部', '2部', '3部'];
const TEAM_NUMBERS: readonly TeamNumber[] = [1, 2, 3, 4];

function toClassLabel(name: string): ClassLabel {
  if ((CLASS_LABELS as readonly string[]).includes(name)) return name as ClassLabel;
  throw new Error(`想定外の部です: ${name}`);
}

function toTeamNumber(value: number): TeamNumber {
  if ((TEAM_NUMBERS as readonly number[]).includes(value)) return value as TeamNumber;
  throw new Error(`想定外のチーム番号です: ${value}`);
}

function toCourtTeam(side: CourtsViewSideRow): CourtTeam {
  return { number: toTeamNumber(side.teamNumber ?? 0), players: side.players.map((p) => p.name) };
}

/**
 * 両側のチームが決まっているか。
 *
 * 決勝トーナメントの試合は相手が決まる前から枠だけ作ってあり（supabase/seed.sql）、
 * その状態でコートを割り当てられることがある。出す名前も色も無いので、
 * そのコートは出さずに飛ばす。**ここで例外を投げると当日いちばん見る画面が丸ごと落ちる。**
 */
function hasBothTeams(row: CourtsViewMatchRow): boolean {
  return row.teamA.teamNumber !== null && row.teamB.teamNumber !== null;
}

function isMine(row: CourtsViewMatchRow, currentPlayerId: string | null): boolean {
  if (!currentPlayerId) return false;
  return [...row.teamA.players, ...row.teamB.players].some((p) => p.playerId === currentPlayerId);
}

/** ゲームの枠を max_game_count 個ぶん用意し、行が無いゲームは 0-0 で埋める。 */
function toGames(scores: CourtsViewGameScoreRow[], maxGameCount: number): GameScore[] {
  const games: GameScore[] = Array.from({ length: maxGameCount }, () => [0, 0]);
  for (const score of scores) {
    if (score.gameNumber < 1 || score.gameNumber > maxGameCount) continue;
    games[score.gameNumber - 1] = [score.sideAScore, score.sideBScore];
  }
  return games;
}

function toLiveMatch(row: CourtsViewMatchRow, currentPlayerId: string | null): LiveMatch {
  return {
    matchId: row.matchId,
    status: row.status === 'live' ? 'live' : 'waiting',
    classLabel: toClassLabel(row.divisionName),
    roundLabel: row.roundName,
    teamA: toCourtTeam(row.teamA),
    teamB: toCourtTeam(row.teamB),
    isMine: isMine(row, currentPlayerId),
    maxGameCount: row.maxGameCount,
    games: toGames(row.gameScores, row.maxGameCount),
  };
}

function toNextMatch(row: CourtsViewMatchRow, currentPlayerId: string | null): NextMatch {
  return {
    classLabel: toClassLabel(row.divisionName),
    teamA: toCourtTeam(row.teamA),
    teamB: toCourtTeam(row.teamB),
    isMine: isMine(row, currentPlayerId),
  };
}

/**
 * DB の行（コート割り当てのある試合）を `/courts` の画面の形に組み立てる。
 *
 * コートごとに `order_in_court` の若い試合を「進行中の枠」（live、得点を押せる）、
 * その次を「次」（next、名前だけ）として出す。3 試合目以降は今回は出さない。
 */
export function buildCourtsView(input: CourtsViewInput): Court[] {
  const byCourt = new Map<number, CourtsViewMatchRow[]>();
  for (const row of input.matches) {
    if (row.status !== 'live' && row.status !== 'waiting') continue;
    if (!hasBothTeams(row)) continue;
    const list = byCourt.get(row.courtNumber) ?? [];
    list.push(row);
    byCourt.set(row.courtNumber, list);
  }

  const courts: Court[] = [];
  for (const [courtNumber, rows] of byCourt) {
    const sorted = [...rows].sort((a, b) => a.orderInCourt - b.orderInCourt);
    const [current, next] = sorted;
    courts.push({
      courtNumber,
      live: current ? toLiveMatch(current, input.currentPlayerId) : null,
      next: next ? toNextMatch(next, input.currentPlayerId) : null,
    });
  }

  return courts.sort((a, b) => a.courtNumber - b.courtNumber);
}
