/**
 * /matches の見た目を作るための見本データ。
 *
 * 試合を保存する表（matches など）がまだ無いので、
 * ここに型と固定値を置いて画面だけ先に作る。
 * 本物のデータをつなぐときは、この型を保ったまま
 * src/app/(app)/matches/page.tsx が渡す中身を差し替える。
 */

/** チーム色は 1〜4 の 4 色のみ（globals.css の --color-team-1〜4）。得点入力の色分けに使う。 */
export type TeamNumber = 1 | 2 | 3 | 4;

export type ClassLabel = '1部' | '2部' | '3部';

export type MatchStatus = 'done' | 'live' | 'waiting';

export type MatchTeam = {
  number: TeamNumber;
  players: string[];
};

/** 1 ゲームの得点。[ペアA の点, ペアB の点]。 */
export type GameScore = [number, number];

export type CourtMatch = {
  id: string;
  /** そのコートの中での試合順（1試合目、2試合目…）。 */
  orderInCourt: number;
  classLabel: ClassLabel;
  /** 例: '予選 1回戦' */
  roundLabel: string;
  status: MatchStatus;
  teamA: MatchTeam;
  teamB: MatchTeam;
  /** 自分の試合には印を付ける。 */
  isMine: boolean;
  /** 終わったゲームの得点。status が 'waiting' のときは空配列。 */
  finishedGames: GameScore[];
  /** 進行中のゲームの現在の得点。status が 'live' のときだけ持つ。 */
  currentGame?: GameScore;
};

export type Court = {
  courtNumber: number;
  matches: CourtMatch[];
};

export const sampleCourts: Court[] = [
  {
    courtNumber: 1,
    matches: [
      {
        id: 'c1-1',
        orderInCourt: 1,
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 1, players: ['佐藤', '鈴木'] },
        teamB: { number: 2, players: ['高橋', '伊藤'] },
        isMine: false,
        finishedGames: [
          [21, 15],
          [21, 18],
        ],
      },
      {
        id: 'c1-2',
        orderInCourt: 2,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 3, players: ['渡辺', '小林'] },
        teamB: { number: 4, players: ['山本', '松本'] },
        isMine: true,
        finishedGames: [
          [18, 21],
          [17, 21],
        ],
      },
      {
        id: 'c1-3',
        orderInCourt: 3,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'live',
        teamA: { number: 1, players: ['中村'] },
        teamB: { number: 2, players: ['加藤'] },
        isMine: false,
        finishedGames: [[21, 19]],
        currentGame: [12, 9],
      },
      {
        id: 'c1-4',
        orderInCourt: 4,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 3, players: ['吉田', '斎藤'] },
        teamB: { number: 4, players: ['木村', '林'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c1-5',
        orderInCourt: 5,
        classLabel: '2部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['清水', '山口'] },
        teamB: { number: 2, players: ['井上', '森'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c1-6',
        orderInCourt: 6,
        classLabel: '3部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 3, players: ['橋本'] },
        teamB: { number: 4, players: ['石川'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    courtNumber: 2,
    matches: [
      {
        id: 'c2-1',
        orderInCourt: 1,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 2, players: ['前田', '藤田'] },
        teamB: { number: 3, players: ['岡田', '長谷川'] },
        isMine: false,
        finishedGames: [
          [21, 17],
          [19, 21],
          [21, 16],
        ],
      },
      {
        id: 'c2-2',
        orderInCourt: 2,
        classLabel: '3部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 4, players: ['村上'] },
        teamB: { number: 1, players: ['近藤'] },
        isMine: false,
        finishedGames: [[21, 14]],
      },
      {
        id: 'c2-3',
        orderInCourt: 3,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'live',
        teamA: { number: 2, players: ['石井', '斉藤'] },
        teamB: { number: 3, players: ['坂本', '遠藤'] },
        isMine: false,
        finishedGames: [],
        currentGame: [8, 6],
      },
      {
        id: 'c2-4',
        orderInCourt: 4,
        classLabel: '2部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 4, players: ['青木', '福田'] },
        teamB: { number: 1, players: ['三浦', '西村'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c2-5',
        orderInCourt: 5,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 2, players: ['金子'] },
        teamB: { number: 3, players: ['太田'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c2-6',
        orderInCourt: 6,
        classLabel: '1部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 4, players: ['原田', '松田'] },
        teamB: { number: 1, players: ['上田', '柴田'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c2-7',
        orderInCourt: 7,
        classLabel: '2部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 2, players: ['宮崎', '横山'] },
        teamB: { number: 3, players: ['宮本', '内田'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    courtNumber: 3,
    matches: [
      {
        id: 'c3-1',
        orderInCourt: 1,
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 1, players: ['高木', '桜井'] },
        teamB: { number: 4, players: ['木下', '野口'] },
        isMine: false,
        finishedGames: [
          [21, 12],
          [21, 20],
        ],
      },
      {
        id: 'c3-2',
        orderInCourt: 2,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'live',
        teamA: { number: 2, players: ['松井', '菊地'] },
        teamB: { number: 3, players: ['和田', '荒木'] },
        isMine: true,
        finishedGames: [[15, 21]],
        currentGame: [10, 10],
      },
      {
        id: 'c3-3',
        orderInCourt: 3,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['小川'] },
        teamB: { number: 4, players: ['安藤'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c3-4',
        orderInCourt: 4,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 2, players: ['小野', '前川'] },
        teamB: { number: 3, players: ['武田', '平野'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c3-5',
        orderInCourt: 5,
        classLabel: '2部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['小山', '大西'] },
        teamB: { number: 4, players: ['谷口', '新井'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c3-6',
        orderInCourt: 6,
        classLabel: '3部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 2, players: ['丸山'] },
        teamB: { number: 3, players: ['今井'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    courtNumber: 4,
    matches: [
      {
        id: 'c4-1',
        orderInCourt: 1,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 3, players: ['河野', '藤原'] },
        teamB: { number: 4, players: ['大野', '西田'] },
        isMine: false,
        finishedGames: [
          [21, 19],
          [18, 21],
          [21, 17],
        ],
      },
      {
        id: 'c4-2',
        orderInCourt: 2,
        classLabel: '3部',
        roundLabel: '予選 1回戦',
        status: 'live',
        teamA: { number: 1, players: ['杉山'] },
        teamB: { number: 2, players: ['増田'] },
        isMine: false,
        finishedGames: [],
        currentGame: [14, 11],
      },
      {
        id: 'c4-3',
        orderInCourt: 3,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 3, players: ['小島', '福井'] },
        teamB: { number: 4, players: ['岡本', '横田'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c4-4',
        orderInCourt: 4,
        classLabel: '2部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['竹内', '望月'] },
        teamB: { number: 2, players: ['中野', '浜田'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c4-5',
        orderInCourt: 5,
        classLabel: '3部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 3, players: ['川口'] },
        teamB: { number: 4, players: ['久保'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c4-6',
        orderInCourt: 6,
        classLabel: '1部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['浅野', '菅原'] },
        teamB: { number: 2, players: ['千葉', '岩崎'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    courtNumber: 5,
    matches: [
      {
        id: 'c5-1',
        orderInCourt: 1,
        classLabel: '3部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 4, players: ['榊原'] },
        teamB: { number: 1, players: ['菅野'] },
        isMine: true,
        finishedGames: [[21, 16]],
      },
      {
        id: 'c5-2',
        orderInCourt: 2,
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        status: 'live',
        teamA: { number: 2, players: ['須藤', '柳田'] },
        teamB: { number: 3, players: ['大塚', '岸本'] },
        isMine: false,
        finishedGames: [[21, 18]],
        currentGame: [6, 4],
      },
      {
        id: 'c5-3',
        orderInCourt: 3,
        classLabel: '2部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 4, players: ['市川', '古賀'] },
        teamB: { number: 1, players: ['大久保', '荒井'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c5-4',
        orderInCourt: 4,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 2, players: ['本田'] },
        teamB: { number: 3, players: ['大石'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c5-5',
        orderInCourt: 5,
        classLabel: '1部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 4, players: ['八木', '相馬'] },
        teamB: { number: 1, players: ['星野', '磯部'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    courtNumber: 6,
    matches: [
      {
        id: 'c6-1',
        orderInCourt: 1,
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 1, players: ['白石', '梅田'] },
        teamB: { number: 2, players: ['沢田', '芦田'] },
        isMine: false,
        finishedGames: [
          [16, 21],
          [21, 23],
        ],
      },
      {
        id: 'c6-2',
        orderInCourt: 2,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'live',
        teamA: { number: 3, players: ['川崎'] },
        teamB: { number: 4, players: ['宮田'] },
        isMine: false,
        finishedGames: [],
        currentGame: [3, 2],
      },
      {
        id: 'c6-3',
        orderInCourt: 3,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['野村', '土屋'] },
        teamB: { number: 2, players: ['奥村', '亀井'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c6-4',
        orderInCourt: 4,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'waiting',
        teamA: { number: 3, players: ['須田'] },
        teamB: { number: 4, players: ['榎本'] },
        isMine: false,
        finishedGames: [],
      },
      {
        id: 'c6-5',
        orderInCourt: 5,
        classLabel: '2部',
        roundLabel: '予選 3回戦',
        status: 'waiting',
        teamA: { number: 1, players: ['小池', '樋口'] },
        teamB: { number: 2, players: ['平田', '桑原'] },
        isMine: false,
        finishedGames: [],
      },
    ],
  },
  {
    // すべて終了しているコートを 1 つ用意して、見出しの出し分けを確かめられるようにする。
    courtNumber: 7,
    matches: [
      {
        id: 'c7-1',
        orderInCourt: 1,
        classLabel: '1部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 1, players: ['安田', '柏木'] },
        teamB: { number: 4, players: ['須永', '樽見'] },
        isMine: false,
        finishedGames: [
          [21, 14],
          [21, 17],
        ],
      },
      {
        id: 'c7-2',
        orderInCourt: 2,
        classLabel: '2部',
        roundLabel: '予選 1回戦',
        status: 'done',
        teamA: { number: 2, players: ['川上'] },
        teamB: { number: 3, players: ['尾崎'] },
        isMine: false,
        finishedGames: [[21, 19]],
      },
      {
        id: 'c7-3',
        orderInCourt: 3,
        classLabel: '3部',
        roundLabel: '予選 2回戦',
        status: 'done',
        teamA: { number: 1, players: ['金田', '寺田'] },
        teamB: { number: 2, players: ['牧野', '滝沢'] },
        isMine: false,
        finishedGames: [
          [21, 18],
          [19, 21],
          [21, 15],
        ],
      },
      {
        id: 'c7-4',
        orderInCourt: 4,
        classLabel: '1部',
        roundLabel: '予選 2回戦',
        status: 'done',
        teamA: { number: 3, players: ['服部'] },
        teamB: { number: 4, players: ['熊谷'] },
        isMine: false,
        finishedGames: [[21, 13]],
      },
      {
        id: 'c7-5',
        orderInCourt: 5,
        classLabel: '2部',
        roundLabel: '予選 3回戦',
        status: 'done',
        teamA: { number: 1, players: ['米田', '本間'] },
        teamB: { number: 2, players: ['三宅', '関口'] },
        isMine: false,
        finishedGames: [
          [21, 20],
          [21, 16],
        ],
      },
      {
        id: 'c7-6',
        orderInCourt: 6,
        classLabel: '3部',
        roundLabel: '予選 3回戦',
        status: 'done',
        teamA: { number: 3, players: ['角田'] },
        teamB: { number: 4, players: ['宇野'] },
        isMine: false,
        finishedGames: [[21, 17]],
      },
    ],
  },
  {
    // 試合が 1 つも無いコート。「予定なし」の出し分けを確かめる。
    courtNumber: 8,
    matches: [],
  },
];
