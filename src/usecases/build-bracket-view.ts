import {
  classLabelsByDivisionId,
  UNKNOWN_CLASS_LABEL,
  type ClassLabel,
  type DivisionRow,
} from '@/domain/class-labels';
import { matchOutcome } from '@/domain/match-rules';
import type { GameScore } from '@/domain/scoring';
import {
  buildStandings,
  matchupResult,
  type MatchInput,
  type MatchupInput,
} from '@/domain/standings';
import type { CardMatch, CardStatus, LeagueCard, StandingRow, Team } from '@/ui/bracket/types';

/**
 * 対戦表（`/bracket`）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-10-07-bracket-real-data.md
 * 層の分け方は AGENTS.md の「db が読む → usecases が画面の形に組む → page.tsx は呼ぶだけ」に従う
 * （読み取りは `src/db/bracket.ts`）。勝敗と順位の計算は作り直さず
 * `src/domain/standings.ts`（matchupResult / buildStandings）に任せる。
 */

export type BracketViewDivisionRow = DivisionRow;

export type BracketViewTeamRow = {
  id: string;
  /** `teams.team_number`（そのまま。色の対応は `src/domain/class-labels.ts`）。 */
  teamNumber: number;
  name: string;
  sortOrder: number;
};

export type BracketViewPlayerRow = {
  /** `match_players.side`。'a' | 'b'。 */
  side: string;
  orderInPair: number;
  name: string;
};

export type BracketViewMatchRow = {
  id: string;
  /** `matches.status`。'waiting' | 'live' | 'done'。 */
  status: string;
  maxGameCount: number;
  divisionId: string;
  orderInMatchup: number;
  players: BracketViewPlayerRow[];
  gameScores: GameScore[];
};

/** 対戦（`matchups` の 1 行）。段の種類と並びは段から持ってくる（フラットにして渡す）。 */
export type BracketViewMatchupRow = {
  id: string;
  /** その対戦が属する段の `stages.format`。'league' | 'knockout'。 */
  stageFormat: string;
  stageSortOrder: number;
  roundName: string;
  sortOrder: number;
  sideATeamId: string | null;
  sideBTeamId: string | null;
  /** 相手がまだ決まっていない側の空枠の名前（例: '予選1位'）。決まっていれば null。 */
  sideASlotLabel: string | null;
  sideBSlotLabel: string | null;
  matches: BracketViewMatchRow[];
};

export type BracketViewInput = {
  /** 選手として入った人のチームの `teams.id`。観戦者・未入場・チームに入っていない人は null。 */
  myTeamId: string | null;
  divisions: BracketViewDivisionRow[];
  teams: BracketViewTeamRow[];
  /** 予選・決勝の両方の対戦。 */
  matchups: BracketViewMatchupRow[];
  /** 読む上限を超えた（読み切れていない）。黙って欠けさせず、画面で知らせる。 */
  truncated: boolean;
};

export type BracketView = {
  teams: Team[];
  leagueCards: LeagueCard[];
  standings: StandingRow[];
  /** 予選リーグの対戦が 1 つでも登録されているか。無ければ画面は案内だけを出す。 */
  hasLeagueMatchups: boolean;
  truncated: boolean;
};

const LEAGUE_FORMAT = 'league';

function toMatchInput(match: BracketViewMatchRow): MatchInput {
  return {
    maxGameCount: match.maxGameCount,
    gameScores: match.gameScores,
    status: match.status,
  };
}

function toCardStatus(status: string): CardStatus {
  if (status === 'done') return 'done';
  if (status === 'live') return 'live';
  return 'waiting';
}

/**
 * 対戦の状態。中の試合が全部終わった → 終了、全部まだ → 未、それ以外 → 試合中。
 * 試合がまだ 1 つも登録されていない対戦は、何も始まっていないので「未」。
 */
export function statusOfMatchup(matches: BracketViewMatchRow[]): CardStatus {
  if (matches.length === 0) return 'waiting';
  if (matches.every((match) => match.status === 'done')) return 'done';
  if (matches.every((match) => match.status === 'waiting')) return 'waiting';
  return 'live';
}

/** 段 → 対戦の順（画面に出す順）。 */
function byDisplayOrder(a: BracketViewMatchupRow, b: BracketViewMatchupRow): number {
  return a.stageSortOrder - b.stageSortOrder || a.sortOrder - b.sortOrder;
}

function namesOf(players: BracketViewPlayerRow[], side: 'a' | 'b'): string[] {
  return players
    .filter((player) => player.side === side)
    .sort((a, b) => a.orderInPair - b.orderInPair)
    .map((player) => player.name);
}

function toCardMatch(
  match: BracketViewMatchRow,
  classLabelById: Map<string, ClassLabel>
): CardMatch {
  const status = toCardStatus(match.status);
  const base = {
    id: match.id,
    classLabel: classLabelById.get(match.divisionId) ?? UNKNOWN_CLASS_LABEL,
    status,
    teamAPlayers: namesOf(match.players, 'a'),
    teamBPlayers: namesOf(match.players, 'b'),
  };
  if (status === 'waiting') return base;

  const [gamesWonA, gamesWonB] = matchOutcome(match.gameScores, match.maxGameCount).wonGames;
  return { ...base, gamesWonA, gamesWonB };
}

function toLeagueCard(
  matchup: BracketViewMatchupRow,
  teamA: BracketViewTeamRow,
  teamB: BracketViewTeamRow,
  classLabelById: Map<string, ClassLabel>
): LeagueCard {
  const status = statusOfMatchup(matchup.matches);
  const matches = [...matchup.matches]
    .sort((a, b) => a.orderInMatchup - b.orderInMatchup)
    .map((match) => toCardMatch(match, classLabelById));
  const card = {
    id: matchup.id,
    teamA: teamA.teamNumber,
    teamB: teamB.teamNumber,
    status,
    matches,
  };
  if (status === 'waiting') return card;

  const [gamesWonA, gamesWonB] = matchupResult(matchup.matches.map(toMatchInput)).wonMatches;
  return { ...card, gamesWonA, gamesWonB };
}

export function buildBracketView(input: BracketViewInput): BracketView {
  const classLabelById = classLabelsByDivisionId(input.divisions);
  const sortedTeams = [...input.teams].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.teamNumber - b.teamNumber
  );
  const teamById = new Map(sortedTeams.map((team) => [team.id, team]));
  const matchups = [...input.matchups].sort(byDisplayOrder);

  const leagueMatchups = matchups.filter((matchup) => matchup.stageFormat === LEAGUE_FORMAT);
  const leagueCards = leagueMatchups.flatMap((matchup) => {
    const teamA = matchup.sideATeamId ? teamById.get(matchup.sideATeamId) : undefined;
    const teamB = matchup.sideBTeamId ? teamById.get(matchup.sideBTeamId) : undefined;
    // 相手がまだ決まっていない対戦は、星取表のどのマスにも置けない。
    return teamA && teamB ? [toLeagueCard(matchup, teamA, teamB, classLabelById)] : [];
  });

  // 順位表には決勝の対戦も含めて全部渡す。「順位は予選だけで決まる」はルールの持ち主
  // （buildStandings）が守るので、ここで予選だけに絞り込まない（絞り忘れの心配をなくす。#62）。
  const standingsInput: MatchupInput[] = matchups.flatMap((matchup) =>
    matchup.sideATeamId && matchup.sideBTeamId
      ? [
          {
            sideATeamId: matchup.sideATeamId,
            sideBTeamId: matchup.sideBTeamId,
            stageFormat: matchup.stageFormat,
            matches: matchup.matches.map(toMatchInput),
          },
        ]
      : []
  );
  const standings = buildStandings(
    sortedTeams.map((team) => ({ teamId: team.id })),
    standingsInput
  ).map((row): StandingRow => {
    return {
      rank: row.rank,
      teamNumber: teamById.get(row.teamId)!.teamNumber,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      pointDiff: row.pointDiff,
      isSelf: input.myTeamId !== null && row.teamId === input.myTeamId,
    };
  });

  return {
    teams: sortedTeams.map((team) => ({ number: team.teamNumber, name: team.name })),
    leagueCards,
    standings,
    hasLeagueMatchups: leagueMatchups.length > 0,
    truncated: input.truncated,
  };
}
