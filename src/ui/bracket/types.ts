/**
 * /bracket（対戦表）の画面の形。
 *
 * 元は `sample-data.ts` に型と見本の固定値が同居していたが、DB につないだいまは
 * 「画面の型」と「テスト用の値」を分ける（結果LIVE の `src/ui/courts/types.ts` と同じ形）。
 * 型はここ、値は各テストファイルが自前で小さく組む。
 * `src/usecases/build-bracket-view.ts`（DB の行 → ここの型への変換）も、この型をそのまま返す。
 *
 * チームの色・部の色の対応は src/domain/class-labels.ts の 1 か所だけ。ここには持たない
 * （チーム番号はそのまま、部は「文字 + 色の番号」の `ClassLabel` で持つ）。
 */

import type { ClassLabel } from '@/domain/class-labels';

export type { ClassLabel };

export type Team = {
  /** `teams.team_number`。色の対応は `src/domain/class-labels.ts`。 */
  number: number;
  name: string;
};

/** 対戦（カード・KO の一戦）の進み具合。 */
export type CardStatus = 'done' | 'live' | 'waiting';

/** カードの中の 1 試合（部ごとのペア戦）。 */
export type CardMatch = {
  id: string;
  classLabel: ClassLabel;
  status: CardStatus;
  teamAPlayers: string[];
  teamBPlayers: string[];
  /** その試合のゲーム数（勝ったゲームの数）。status が 'waiting' のときは無い。 */
  gamesWonA?: number;
  gamesWonB?: number;
};

/** 予選リーグの「対戦（カード）」1 つ。チーム同士の総当たり戦。 */
export type LeagueCard = {
  id: string;
  teamA: number;
  teamB: number;
  status: CardStatus;
  /** status が 'done' | 'live' のときの、カード内の勝ち試合数。 */
  gamesWonA?: number;
  gamesWonB?: number;
  matches: CardMatch[];
};

export type StandingRow = {
  rank: number;
  teamNumber: number;
  wins: number;
  losses: number;
  /** 引き分けの対戦の数。0 のときは画面に出さない。 */
  draws: number;
  gamesWon: number;
  gamesLost: number;
  pointDiff: number;
  /** 自分のチームの行だけ強調表示するための印。 */
  isSelf: boolean;
};

/** 決勝トーナメントの枠 1 つ。まだ決まっていなければ label だけを持つ。 */
export type KoSlot = {
  label: string;
  isDecided: boolean;
};

export type KoMatch = {
  id: string;
  /** '準決勝1' のように、勝者・敗者の未確定枠の文言を作るのに使う。 */
  roundLabel: string;
  slotA: KoSlot;
  slotB: KoSlot;
  status: CardStatus;
  scoreA?: number;
  scoreB?: number;
};

export type Champion = {
  decided: boolean;
  teamName?: string;
};

export type KoBracketData = {
  /** 予選リーグがまだ終わっていなければ組み合わせ未確定の注記を出す。 */
  leagueFinished: boolean;
  semifinals: [KoMatch, KoMatch];
  final: KoMatch;
  thirdPlace: KoMatch;
  champion: Champion;
};
