import { buildPlayerRecord, type FinishedMatchRecord } from '@/domain/player-record';
import {
  classLabelsByDivisionId,
  UNKNOWN_CLASS_LABEL,
  type ClassLabel,
  type DivisionRow,
} from '@/domain/class-labels';
import { matchOutcome, matchWinner, retiredSideOf } from '@/domain/match-rules';
import { playedGameScores, type GameScore } from '@/domain/scoring';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/types';

/**
 * `/me`（マイページ）を DB の行から組み立てる。DB も HTTP も触らない純粋な計算。
 *
 * 仕様: docs/specs/2026-09-05-me-real-data.md
 * 層の分け方は AGENTS.md の「db が読む → usecases が画面の形に組む → page.tsx は呼ぶだけ」に従う
 * （読み取りは `src/db/me.ts`。ゲームの得点・勝敗の型は `src/domain/scoring.ts` /
 * `src/domain/match-rules.ts` の `GameScore` にそろえ、ここでは独自の型を作らない）。
 *
 * 部のラベル決め（文字は `divisions.name`、色は並び順）は `src/domain/class-labels.ts` の
 * 共通関数を使う（結果LIVE の `build-courts-view.ts` と同じ判断を 2 か所にコピーしない。
 * docs/specs/2026-09-19-courts-real-data.md）。チームの色は番号のまま画面に渡し、
 * 対応表も同じファイルの `teamBgClass` に 1 か所だけ置く。
 */

export type MyPageViewPlayerRow = {
  participantId: string;
  side: 'a' | 'b';
  orderInPair: number;
  name: string;
  /** その人のチーム名。チーム無しは null。 */
  teamName: string | null;
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
  /** `matches.ending`。'normal' | 'retired_side_a' | 'retired_side_b'。 */
  ending: string;
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

export type MyPageViewDivisionRow = DivisionRow;

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
  /** 終わっていない試合（試合中＋未実施）の数。ヘッダーの「あと◯試合」に使う。 */
  remainingCount: number;
  /**
   * 画面に出す試合。未実施（「◯試合目」→ コート番号の若い順）→ 終了の順。
   * **試合中の試合は入れない**（本人は試合中に画面を見ない。仕様 2026-11-22-me-redesign.md）。
   */
  matches: MyMatch[];
};

function findMySide(match: MyPageViewMatchRow, myParticipantId: string): 'a' | 'b' | null {
  const me = match.players.find((p) => p.participantId === myParticipantId);
  return me?.side ?? null;
}

function playersOfSide(match: MyPageViewMatchRow, side: 'a' | 'b'): MyPageViewPlayerRow[] {
  return match.players.filter((p) => p.side === side).sort((a, b) => a.orderInPair - b.orderInPair);
}

const LAST = Number.MAX_SAFE_INTEGER;

/**
 * 未実施・終了の並び。「◯試合目」の若い順 → コート番号の若い順 → id。
 * コートは並行して進むので、試合目の数が時間の近さに近い。未定（null）は後ろ。
 * DB は行の順番を約束しないので、最後に id で決める（開き直すたびに並びが入れ替わらないように）。
 */
function compareMatches(a: MyPageViewMatchRow, b: MyPageViewMatchRow): number {
  const orderDiff = (a.orderInCourt ?? LAST) - (b.orderInCourt ?? LAST);
  if (orderDiff !== 0) return orderDiff;
  const courtDiff = (a.courtNumber ?? LAST) - (b.courtNumber ?? LAST);
  if (courtDiff !== 0) return courtDiff;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** 未実施が先、終了が後ろ。 */
function compareForDisplay(a: MyPageViewMatchRow, b: MyPageViewMatchRow): number {
  const rank = (m: MyPageViewMatchRow) => (m.status === 'done' ? 1 : 0);
  return rank(a) - rank(b) || compareMatches(a, b);
}

/** ゲーム番号順に並べる。`MyPageViewGameScoreRow` は `GameScore` と同じ形なのでそのまま使える。 */
function toGameScores(scores: MyPageViewGameScoreRow[]): GameScore[] {
  return [...scores].sort((a, b) => a.gameNumber - b.gameNumber);
}

/** 得点を「自分の点、相手の点」の順に組み替える。 */
function toMyGameScores(scores: GameScore[], mySide: 'a' | 'b'): [number, number][] {
  return scores.map((score) =>
    mySide === 'a' ? [score.sideAScore, score.sideBScore] : [score.sideBScore, score.sideAScore]
  );
}

/** 相手側のチーム名。重複を除き、違えば「・」でつなぐ。1 つも無ければ null。 */
function joinTeamNames(players: MyPageViewPlayerRow[]): string | null {
  const names = [
    ...new Set(players.map((p) => p.teamName).filter((name): name is string => name !== null)),
  ];
  return names.length > 0 ? names.join('・') : null;
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
  // 万一 division がその大会に無ければ、別の部に見えないよう「部不明」にする。
  const classLabel = classLabelById.get(match.divisionId) ?? UNKNOWN_CLASS_LABEL;

  const base: MyMatch = {
    id: match.matchId,
    status: match.status === 'done' ? 'done' : 'waiting',
    roundLabel: match.roundName,
    classLabel,
    opponentNames: opponents.map((p) => p.name),
    opponentTeamName: joinTeamNames(opponents),
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
    // 勝ちは matchWinner 1 か所で決める（順位表・結果LIVE と食い違わないため。棄権は相手の勝ち）。
    base.won =
      matchWinner(gameScoresAB, match.maxGameCount, match.ending) === (mySide === 'a' ? 'A' : 'B');
    const retiredSide = retiredSideOf(match.ending);
    if (retiredSide !== null) {
      base.retiredNames = playersOfSide(match, retiredSide === 'A' ? 'a' : 'b').map((p) => p.name);
    }
  }

  return base;
}

export function buildMyPageView(input: MyPageViewInput): MyPageView {
  const classLabelById = classLabelsByDivisionId(input.divisions);

  const profile: MyProfile = {
    name: input.profile.name,
    teamName: input.profile.teamName,
    teamNumber: input.profile.teamNumber,
    classLabel: input.profile.divisionId
      ? (classLabelById.get(input.profile.divisionId) ?? null)
      : null,
  };

  // **自分が出ていない試合はここで落とす。** 他人の試合が 1 件でも混ざると
  // マイページの意味が壊れるので、DB の絞り込みだけに頼らずここでも確かめる。
  const myMatches = input.matches
    .map((match) => ({ match, mySide: findMySide(match, input.myParticipantId) }))
    .filter((row): row is { match: MyPageViewMatchRow; mySide: 'a' | 'b' } => row.mySide !== null)
    .sort((x, y) => compareForDisplay(x.match, y.match));

  // 試合中は出さないが「あと◯試合」には数える
  const remainingCount = myMatches.filter((row) => row.match.status !== 'done').length;

  const matches = myMatches
    .filter((row) => row.match.status !== 'live')
    .map((row) => toMyMatch(row.match, input.myParticipantId, row.mySide, classLabelById));

  const finishedRecords: FinishedMatchRecord[] = myMatches
    .filter((row) => row.match.status === 'done')
    .map((row) => ({
      maxGameCount: row.match.maxGameCount,
      gameScores: toGameScores(playedGameScores(row.match.gameScores)),
      mySide: row.mySide === 'a' ? 'A' : 'B',
      ending: row.match.ending,
    }));

  const record = buildPlayerRecord(finishedRecords);

  return { profile, record, remainingCount, matches };
}
