/**
 * /courts（結果LIVE）の見た目を作るための見本データ。
 *
 * 試合を保存する表がまだ無いので、ここに型と固定値を置いて画面だけ先に作る。
 * 本物のデータをつなぐときは、この型を保ったまま
 * src/app/(app)/courts/page.tsx が渡す中身を差し替える。
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
  classLabel: ClassLabel;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  teamA: CourtTeam;
  teamB: CourtTeam;
  /** 自分の試合には印を付ける。 */
  isMine: boolean;
  /** 終わったゲームの得点。ページ側で持つ得点状態の初期値としても使う。 */
  finishedGames: GameScore[];
  /** 進行中のゲームの現在の得点。ページ側で持つ得点状態の初期値としても使う。 */
  currentGame: GameScore;
};

/** 画面を開いている間だけの得点。ページが持ち、カードは受け取って出すだけ。 */
export type LiveScore = {
  finishedGames: GameScore[];
  currentGame: GameScore;
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

/** 見出しの「◯/◯ 試合消化」に出す見本の固定値。 */
export const totalMatches = 48;
export const completedMatches = 2;

export const sampleCourts: Court[] = [
  {
    courtNumber: 1,
    live: {
      classLabel: '1部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['佐々木', '井上'] },
      teamB: { number: 2, players: ['田中', '木村'] },
      isMine: false,
      finishedGames: [[21, 19]],
      currentGame: [15, 12],
    },
    next: {
      classLabel: '2部',
      teamA: { number: 3, players: ['川口', '浜田'] },
      teamB: { number: 4, players: ['小林', '西村'] },
      isMine: false,
    },
  },
  {
    courtNumber: 2,
    live: {
      classLabel: '2部',
      roundLabel: '予選 1回戦',
      teamA: { number: 3, players: ['山田', '中川'] },
      teamB: { number: 4, players: ['清水', '岡本'] },
      isMine: false,
      finishedGames: [],
      currentGame: [20, 19],
    },
    next: {
      classLabel: '3部',
      teamA: { number: 1, players: ['本田', '荒川'] },
      teamB: { number: 2, players: ['坂本', '石田'] },
      isMine: false,
    },
  },
  {
    courtNumber: 3,
    live: {
      classLabel: '3部',
      roundLabel: '予選 2回戦',
      teamA: { number: 1, players: ['鈴木', '高橋'] },
      teamB: { number: 2, players: ['伊藤', '渡辺'] },
      isMine: true,
      finishedGames: [],
      currentGame: [14, 11],
    },
    next: null,
  },
  {
    courtNumber: 4,
    live: {
      classLabel: '1部',
      roundLabel: '予選 2回戦',
      teamA: { number: 3, players: ['松本', '中村'] },
      teamB: { number: 4, players: ['加藤', '斎藤'] },
      isMine: false,
      finishedGames: [],
      currentGame: [8, 5],
    },
    next: {
      classLabel: '1部',
      teamA: { number: 1, players: ['吉田', '山口'] },
      teamB: { number: 2, players: ['佐藤', '森'] },
      isMine: false,
    },
  },
  {
    courtNumber: 5,
    live: {
      classLabel: '2部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['井上', '小川'] },
      teamB: { number: 2, players: ['林', '橋本'] },
      isMine: false,
      finishedGames: [[21, 17]],
      currentGame: [11, 9],
    },
    next: {
      classLabel: '2部',
      teamA: { number: 3, players: ['石川', '前田'] },
      teamB: { number: 4, players: ['藤田', '岡田'] },
      isMine: false,
    },
  },
  {
    courtNumber: 6,
    live: {
      classLabel: '3部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['長谷川', '村上'] },
      teamB: { number: 2, players: ['近藤', '石井'] },
      isMine: false,
      finishedGames: [],
      currentGame: [5, 3],
    },
    next: null,
  },
  {
    // 進行中の試合が無く、次の試合が決まっているコート。「呼出待ち」の出し分けを確かめる。
    courtNumber: 7,
    live: null,
    next: {
      classLabel: '1部',
      teamA: { number: 3, players: ['斉藤', '坂本'] },
      teamB: { number: 4, players: ['遠藤', '青木'] },
      isMine: true,
    },
  },
  {
    // 進行中の試合も次の試合も無いコート。「予定なし」の出し分けを確かめる。
    courtNumber: 8,
    live: null,
    next: null,
  },
];
