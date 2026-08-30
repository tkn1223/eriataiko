/**
 * /courts（結果LIVE）の画面の形。
 *
 * 元は sample-data.ts に型と値が同居していたが、DB につないだいまは
 * 「画面の型」と「テスト用の値」を分ける。型はここ、値は sample-data.ts。
 * `src/usecases/build-courts-view.ts`（DB の行 → ここの型への変換）も、
 * この型をそのまま返す。
 */

import type { ClassLabel } from '@/ui/components/class-chip';

export type { ClassLabel };

/** チーム色は 1〜4 の 4 色のみ（globals.css の --color-team-1〜4）。得点入力の色分けに使う。 */
export type TeamNumber = 1 | 2 | 3 | 4;

export type CourtTeam = {
  number: TeamNumber;
  players: string[];
};

/** 1 ゲームの得点。[ペアA の点, ペアB の点]。 */
export type GameScore = [number, number];

export type LiveMatch = {
  /** 得点を送るときの宛先（POST /api/matches/{matchId}/scores）。 */
  matchId: string;
  /** `matches.status`。'live' のときだけ画面に LIVE と出す。 */
  status: 'live' | 'waiting';
  classLabel: ClassLabel;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の試合には印を付ける。 */
  isMine: boolean;
  /** ゲームの枠の数（`matches.max_game_count`）。この数だけ枠を並べる。 */
  maxGameCount: number;
  /**
   * 各ゲームの得点。index 0 が第1ゲーム。長さは必ず maxGameCount にそろえ、
   * まだ行の無いゲームは [0, 0] で埋める。
   */
  games: GameScore[];
};

/** 画面を開いている間に押した分を反映する、ページが持つ得点の状態。 */
export type LiveScore = {
  games: GameScore[];
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
  /** 進行中（または開始待ちで現在の枠）の試合。無いコートは「呼出待ち」または「予定なし」になる。 */
  live: LiveMatch | null;
  /** 次の試合。無ければコートに「次」は出さない。 */
  next: NextMatch | null;
};
