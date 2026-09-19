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
 * チーム色の折り返し（1〜4）は src/domain/class-labels.ts の TeamNumber をそのまま使う
 * （マイページと同じ判断。docs/specs/2026-09-19-courts-real-data.md）。
 */

import type { ClassLabel } from '@/ui/components/class-chip';
import type { GameScore } from '@/domain/scoring';
import type { TeamNumber } from '@/domain/class-labels';

export type { ClassLabel, GameScore, TeamNumber };

export type CourtTeam = {
  /** チームが決まっていれば 1〜4 の色番号、まだ決まっていなければ null（灰色扱い）。 */
  teamNumber: TeamNumber | null;
  /** 決まっていれば選手名（ダブルスは2人）。まだ決まっていなければ空配列。 */
  players: string[];
  /**
   * 出場者がまだ決まっていない側の空枠ラベル（`matchups.side_x_slot_label`。例: '予選1位'）。
   * 決まっていれば null。`players` が空のときだけ意味を持つ。
   */
  slotLabel: string | null;
};

export type LiveMatch = {
  /** `matches.id`。得点を保存する入口（`POST /api/matches/[matchId]/scores`）の宛先。 */
  matchId: string;
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
  /**
   * `matches.id`。呼出待ちのコートで先に枠を出すのに使う
   * （docs/specs/2026-09-19-save-score-from-courts.md の「決めたこと」1）。
   */
  matchId: string;
  classLabel: ClassLabel;
  /** 例: '予選 1回戦'。呼出待ちの枠を LIVE の見た目に切り替えたときにも使う。 */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の次の試合には名前を強調する。 */
  isMine: boolean;
  /** LIVE に切り替わったときに並べる枠の数。DB の `matches.max_game_count` と同じ。 */
  maxGameCount: number;
};

/**
 * 送る・送り直す仕組み（`use-score-sync.ts`）がコートに渡す、いまの保存状況。
 * どちらも無ければ何も出さない。
 */
export type ScoreSyncStatus = {
  /** つながらない・5xx・429 で送り直している間の案内。無ければ null。 */
  retryingMessage: string | null;
  /** 4xx で断られ、送り直さないと決めたときの日本語の理由。無ければ null。 */
  rejectedMessage: string | null;
};

export type Court = {
  courtNumber: number;
  /** 進行中の試合。無いコートは「呼出待ち」または「予定なし」になる。 */
  live: LiveMatch | null;
  /** 次の試合。無ければコートに「次」は出さない。 */
  next: NextMatch | null;
};

/**
 * このコートにいま入力できる試合の id。進行中があればその試合、無くて
 * 呼出待ち（選手だけ）なら次の試合。どちらも無ければ null（入力できない）。
 * `use-score-sync.ts` の `sync` に渡す宛先や、`statusByMatchId` を引く鍵に使う。
 */
export function activeMatchId(court: Court, canInput: boolean): string | null {
  if (court.live) return court.live.matchId;
  if (canInput && court.next) return court.next.matchId;
  return null;
}
