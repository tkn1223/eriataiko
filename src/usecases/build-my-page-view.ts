import { buildPlayerRecord, type FinishedMatchRecord } from '@/domain/player-record';
import { matchOutcome, type GameScore } from '@/domain/match-rules';
import { playedGameScores } from '@/domain/scoring';
import type { ClassLabel, MyMatch, MyProfile, MyRecord, TeamNumber } from '@/ui/me/types';

/**
 * `/me`（マイページ）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-09-05-me-real-data.md
 * 層の分け方は `/courts`（結果LIVE）の `build-courts-view.ts` に揃えている。
 */

export type MyPageViewPlayerRow = {
  participantId: string;
  side: 'a' | 'b';
  orderInPair: number;
  name: string;
};

export type MyPageViewGameScoreRow = {
  gameNumber: number;
  sideAScore: number;
  sideBScore: number;
};

export type MyPageViewMatchRow = {
  matchId: string;
  /** `matches.status`。'waiting' | 'live' | 'done'。 */
  status: string;
  maxGameCount: number;
  courtNumber: number | null;
  orderInCourt: number | null;
  divisionId: string;
  /** `matchups.round_name`。例: '予選 1回戦'。 */
  roundName: string;
  /** その試合に出ている全員（自分も含む）。 */
  players: MyPageViewPlayerRow[];
  gameScores: MyPageViewGameScoreRow[];
};

export type MyPageViewDivisionRow = { id: string; sortOrder: number };

export type MyPageViewInput = {
  /** 自分の participants.id。試合の中から自分がどちら側かを見分けるのに使う。 */
  myParticipantId: string;
  profile: {
    name: string;
    /** `teams.team_number`。チーム無しは null。 */
    teamNumber: number | null;
    teamName: string | null;
    /** `participants.division_id`。 */
    divisionId: string | null;
  };
  /** いまの大会の部すべて（並び順のラベル付けに使う）。 */
  divisions: MyPageViewDivisionRow[];
  /** 自分が出る試合すべて。 */
  matches: MyPageViewMatchRow[];
};

export type MyPageView = {
  profile: MyProfile;
  record: MyRecord;
  matches: MyMatch[];
};

const CLASS_LABELS: readonly ClassLabel[] = ['1部', '2部', '3部'];

/**
 * `divisions.sort_order` の小さい順に 1部/2部/3部を当てる。4 つ目以降は 3部。
 * 部の名前ではなく並び順で決める（AGENTS.md / 仕様の「決めたこと」と同じ考え方）。
 */
function classLabelsByDivisionId(divisions: MyPageViewDivisionRow[]): Map<string, ClassLabel> {
  const sorted = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const labelById = new Map<string, ClassLabel>();
  sorted.forEach((division, index) => {
    const label = CLASS_LABELS[index] ?? CLASS_LABELS[CLASS_LABELS.length - 1];
    labelById.set(division.id, label);
  });
  return labelById;
}

/** `teams.team_number` を 1〜4 の 4 色に折り返す（5 チーム目以降は 1 から繰り返す）。 */
function foldTeamNumber(teamNumber: number | null): TeamNumber | null {
  if (teamNumber === null) return null;
  return (((teamNumber - 1) % 4) + 1) as TeamNumber;
}

function findMySide(match: MyPageViewMatchRow, myParticipantId: string): 'a' | 'b' | null {
  const me = match.players.find((p) => p.participantId === myParticipantId);
  return me?.side ?? null;
}

function playersOfSide(match: MyPageViewMatchRow, side: 'a' | 'b'): MyPageViewPlayerRow[] {
  return match.players.filter((p) => p.side === side).sort((a, b) => a.orderInPair - b.orderInPair);
}

/** 並び順のキー。コート・順番の若い順、コート未定は最後。 */
function courtSortKey(match: MyPageViewMatchRow): [number, number] {
  const court = match.courtNumber ?? Number.MAX_SAFE_INTEGER;
  const order = match.orderInCourt ?? Number.MAX_SAFE_INTEGER;
  return [court, order];
}

/**
 * 進行中 → 未実施（コート・順番の若い順）→ 終了、の順。
 *
 * 同じ状態どうしもコート・順番、最後に id で並べる。DB は行の順番を約束しないので、
 * ここで決めないと**開き直すたびに終わった試合の並びが入れ替わる**。
 */
function compareMatches(a: MyPageViewMatchRow, b: MyPageViewMatchRow): number {
  const statusRank: Record<string, number> = { live: 0, waiting: 1, done: 2 };

  const rankDiff = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
  if (rankDiff !== 0) return rankDiff;

  const [courtA, orderA] = courtSortKey(a);
  const [courtB, orderB] = courtSortKey(b);
  if (courtA !== courtB) return courtA - courtB;
  if (orderA !== orderB) return orderA - orderB;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

function toGameScores(scores: MyPageViewGameScoreRow[]): GameScore[] {
  return [...scores]
    .sort((a, b) => a.gameNumber - b.gameNumber)
    .map((score): GameScore => [score.sideAScore, score.sideBScore]);
}

/** 得点を「自分の点、相手の点」の順に組み替える。 */
function toMyGameScores(scores: GameScore[], mySide: 'a' | 'b'): [number, number][] {
  return scores.map(([scoreA, scoreB]) => (mySide === 'a' ? [scoreA, scoreB] : [scoreB, scoreA]));
}

function toMyMatch(
  match: MyPageViewMatchRow,
  myParticipantId: string,
  mySide: 'a' | 'b',
  classLabelById: Map<string, ClassLabel>
): MyMatch {
  const myTeamPlayers = playersOfSide(match, mySide);
  const opponents = playersOfSide(match, mySide === 'a' ? 'b' : 'a');
  // ペアの相手は同じ side のもう 1 人。シングルスなら自分しかいないので undefined。
  const partner = myTeamPlayers.find((p) => p.participantId !== myParticipantId);

  const gameScoresAB = toGameScores(playedGameScores(match.gameScores));
  // classLabelById は buildMyPageView が divisions から作った、必ず値が入るはずの表。
  // 万一 division がその大会に無ければ「決めていない部」の意味で 3部 に寄せる。
  const classLabel = classLabelById.get(match.divisionId) ?? '3部';

  const base: MyMatch = {
    id: match.matchId,
    status: match.status === 'live' ? 'live' : match.status === 'done' ? 'done' : 'waiting',
    roundLabel: match.roundName,
    classLabel,
    opponentNames: opponents.map((p) => p.name),
    partnerName: partner?.name,
  };

  if (base.status === 'waiting') {
    base.courtNumber = match.courtNumber;
    base.orderInCourt = match.orderInCourt ?? undefined;
    return base;
  }

  base.gameScores = toMyGameScores(gameScoresAB, mySide);

  // 進行中はゲーム数（「ゲーム 2-0」）を出さない。`game_scores` には
  // 「そのゲームが終わったか」の印が無く、いま進めているゲームまで勝ちに数えてしまう
  // （1 ゲーム目 21-17 ＋ 2 ゲーム目 5-3 進行中で「2-0」になる）。決着していない数は出さない。
  if (base.status === 'done') {
    const outcome = matchOutcome(gameScoresAB, match.maxGameCount);
    const [wonByA, wonByB] = outcome.wonGames;
    base.gamesWon = mySide === 'a' ? wonByA : wonByB;
    base.gamesLost = mySide === 'a' ? wonByB : wonByA;
    base.won = outcome.winner === (mySide === 'a' ? 'A' : 'B');
  }

  return base;
}

export function buildMyPageView(input: MyPageViewInput): MyPageView {
  const classLabelById = classLabelsByDivisionId(input.divisions);

  const profile: MyProfile = {
    name: input.profile.name,
    teamName: input.profile.teamName,
    teamNumber: foldTeamNumber(input.profile.teamNumber),
    classLabel: input.profile.divisionId
      ? (classLabelById.get(input.profile.divisionId) ?? null)
      : null,
  };

  // **自分が出ていない試合はここで落とす。** 他人の試合が 1 件でも混ざると
  // マイページの意味が壊れるので、DB の絞り込みだけに頼らずここでも確かめる。
  const myMatches = input.matches
    .map((match) => ({ match, mySide: findMySide(match, input.myParticipantId) }))
    .filter((row): row is { match: MyPageViewMatchRow; mySide: 'a' | 'b' } => row.mySide !== null)
    .sort((x, y) => compareMatches(x.match, y.match));

  const matches = myMatches.map((row) =>
    toMyMatch(row.match, input.myParticipantId, row.mySide, classLabelById)
  );

  const finishedRecords: FinishedMatchRecord[] = myMatches
    .filter((row) => row.match.status === 'done')
    .map((row) => ({
      maxGameCount: row.match.maxGameCount,
      gameScores: toGameScores(playedGameScores(row.match.gameScores)),
      mySide: row.mySide === 'a' ? 'A' : 'B',
    }));

  const record = buildPlayerRecord(finishedRecords);

  return { profile, record, matches };
}
