/**
 * /me（マイページ）の画面の形。
 *
 * 元は sample-data.ts に型と値が同居していたが、DB につないだいまは
 * 「画面の型」と「テスト用の値」を分ける（`/courts` と同じ形）。型はここ、
 * 値は各テストファイルが自前で小さく組む。
 * `src/usecases/build-my-page-view.ts`（DB の行 → ここの型への変換）も、
 * この型をそのまま返す。
 */

/** チーム色は 1〜4 の 4 色のみ（globals.css の --color-team-1〜4）。 */
export type TeamNumber = 1 | 2 | 3 | 4;

export type ClassLabel = '1部' | '2部' | '3部';

export type MyProfile = {
  name: string;
  /** チーム無しの参加者（入力係など）は null。 */
  teamName: string | null;
  /** チーム無しは null（灰色のアバターにする）。 */
  teamNumber: TeamNumber | null;
  /** 部が割り当てられていない参加者は null。 */
  classLabel: ClassLabel | null;
};

/** 大会を通しての成績。終了した試合だけから計算する（進行中の点は混ぜない）。 */
export type MyRecord = {
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointDiff: number;
};

export type MatchStatus = 'done' | 'live' | 'waiting';

export type MyMatch = {
  id: string;
  status: MatchStatus;
  /** status が 'done' のときだけ意味を持つ（勝敗）。 */
  won?: boolean;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  /** ペアの相手の名前。省略＝シングルス。 */
  partnerName?: string;
  classLabel: ClassLabel;
  opponentNames: string[];
  /**
   * status が 'done' のときのゲーム数。
   * 進行中は付けない（どのゲームが終わったかが表に無く、決着前のゲームまで数えてしまうため）。
   */
  gamesWon?: number;
  gamesLost?: number;
  /** status が 'done' | 'live' のときの各ゲームの得点（自分の点、相手の点の順）。 */
  gameScores?: [number, number][];
  /** status が 'waiting' のときのコート番号。null は「コート未定」。 */
  courtNumber?: number | null;
  orderInCourt?: number;
};
