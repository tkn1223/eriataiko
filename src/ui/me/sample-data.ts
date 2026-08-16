/**
 * /me の見た目を作るための見本データ。
 *
 * 選手・試合を保存する表（players / matches など）がまだ無いので、
 * ここに型と固定値を置いて画面だけ先に作る。
 * 本物のデータをつなぐときは、この型を保ったまま
 * src/app/(app)/me/page.tsx が渡す中身を差し替える。
 */

/** チーム色は 1〜4 の 4 色のみ（globals.css の --color-team-1〜4）。 */
export type TeamNumber = 1 | 2 | 3 | 4;

export type ClassLabel = '1部' | '2部' | '3部';

export type MyProfile = {
  name: string;
  teamName: string;
  teamNumber: TeamNumber;
  classLabel: ClassLabel;
};

/** 大会を通しての成績。勝敗・ゲーム・得失点の計算はまだしないので、値はそのまま持たせる。 */
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
  /** status が 'done' | 'live' のときのゲーム数。 */
  gamesWon?: number;
  gamesLost?: number;
  /** status が 'done' | 'live' のときの各ゲームの得点。例: [[21, 15], [21, 18]] */
  gameScores?: [number, number][];
  /** status が 'waiting' のときのコート情報。 */
  courtNumber?: number;
  orderInCourt?: number;
};

export const sampleProfile: MyProfile = {
  name: '佐々木 太郎',
  teamName: 'アリーナクラブ',
  teamNumber: 2,
  classLabel: '2部',
};

export const sampleRecord: MyRecord = {
  wins: 3,
  losses: 1,
  gamesWon: 7,
  gamesLost: 3,
  pointDiff: 21,
};

export const sampleMatches: MyMatch[] = [
  {
    id: 'match-1',
    status: 'done',
    won: true,
    roundLabel: '予選 1回戦',
    partnerName: '山田',
    classLabel: '2部',
    opponentNames: ['佐藤', '鈴木'],
    gamesWon: 2,
    gamesLost: 0,
    gameScores: [
      [21, 15],
      [21, 18],
    ],
  },
  {
    id: 'match-2',
    status: 'done',
    won: false,
    roundLabel: '予選 2回戦',
    partnerName: '山田',
    classLabel: '2部',
    opponentNames: ['田中', '高橋'],
    gamesWon: 1,
    gamesLost: 2,
    gameScores: [
      [21, 19],
      [15, 21],
      [18, 21],
    ],
  },
  {
    id: 'match-3',
    status: 'live',
    roundLabel: '決勝トーナメント 準々決勝',
    classLabel: '2部',
    opponentNames: ['伊藤'],
    gamesWon: 1,
    gamesLost: 0,
    gameScores: [[21, 17]],
  },
  {
    id: 'match-4',
    status: 'waiting',
    roundLabel: '決勝トーナメント 準決勝',
    partnerName: '山田',
    classLabel: '2部',
    opponentNames: ['渡辺', '小林'],
    courtNumber: 3,
    orderInCourt: 2,
  },
];
