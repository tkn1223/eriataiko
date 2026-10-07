/**
 * /courts（結果LIVE）の画面の形。
 *
 * 元は `sample-data.ts` に型と見本の固定値が同居していたが、DB につないだいまは
 * 「画面の型」と「テスト用の値」を分ける（`/me` と同じ形。PR #53）。型はここ、
 * 値は各テストファイルが自前で小さく組む。
 * `src/usecases/build-courts-view.ts`（DB の行 → ここの型への変換）も、
 * この型をそのまま返す。
 *
 * ゲーム 1 つぶんの得点は src/domain/scoring.ts の GameScore
 * （{ gameNumber, sideAScore, sideBScore }）をそのまま使う。「終わったゲーム」
 * 「進行中のゲーム」を分けて持たない。上限ゲーム数ぶんの枠をどれも押せる形にしたため
 * （docs/specs/2026-09-04-finish-match.md、PR #52 レビュー指摘1）。
 *
 * チームの色・部の色の対応は src/domain/class-labels.ts の 1 か所だけ。ここには持たない
 * （チーム番号はそのまま、部は「文字 + 色の番号」の `ClassLabel` で持つ）。
 */

import type { ClassLabel } from '@/domain/class-labels';
import type { GameScore } from '@/domain/scoring';

export type { ClassLabel, GameScore };

/**
 * コートのカードが 0 枚のときの理由。画面は理由ごとに別の日本語を出す
 * （真っ白だと「アプリが壊れている？」と思われる）。
 * - courts-undecided: 試合は残っているのに、コートが 1 つも決まっていない（朝）
 * - all-finished: 試合は全部終わった（夕方）
 * - no-matches: 試合がそもそも 1 つも登録されていない
 */
export type CourtsEmptyReason = 'courts-undecided' | 'all-finished' | 'no-matches';

export type CourtTeam = {
  /** `teams.team_number`。まだ決まっていなければ null（薄い色になる）。 */
  teamNumber: number | null;
  /** 決まっていれば選手名（ダブルスは2人）。まだ決まっていなければ空配列。 */
  players: string[];
  /**
   * 出場者がまだ決まっていない側の空枠ラベル（`matchups.side_x_slot_label`。例: '予選1位'）。
   * 決まっていれば null。`players` が空のときだけ意味を持つ。
   */
  slotLabel: string | null;
};

export type LiveMatch = {
  classLabel: ClassLabel;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の試合には印を付ける。 */
  isMine: boolean;
  /**
   * 得点が入っている枠だけを持てばよい（無い枠は 0 対 0 として扱う）。
   * ページ側で持つ得点状態の初期値としても使う。
   */
  scores: GameScore[];
  /**
   * 勝つのに必要なゲーム数を決める上限。予選リーグ = 1、決勝トーナメント = 3（2 本先取）。
   * DB の `matches.max_game_count` と同じ名前・同じ意味。
   */
  maxGameCount: number;
};

/** 画面を開いている間だけの得点。ページが持ち、カードは受け取って出すだけ。 */
export type LiveScore = {
  scores: GameScore[];
  /** 試合が終わったか。終わったコートは得点を押せなくする。 */
  finished: boolean;
};

export type NextMatch = {
  classLabel: ClassLabel;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の次の試合には名前を強調する。 */
  isMine: boolean;
};

export type Court = {
  courtNumber: number;
  /** 進行中の試合。無いコートは「呼出待ち」または「予定なし」になる。 */
  live: LiveMatch | null;
  /** 次の試合。無ければコートに「次」は出さない。 */
  next: NextMatch | null;
};
