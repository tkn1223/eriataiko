/**
 * /bracket の見た目を作るための見本データ。
 *
 * チーム・試合を保存する表（teams / league_cards など）がまだ無いので、
 * ここに型と固定値を置いて画面だけ先に作る。
 * 本物のデータをつなぐときは、この型を保ったまま
 * src/app/(app)/bracket/page.tsx が渡す中身を差し替える。
 */

/** チーム番号は 1〜4 の 4 チーム固定（今回のスコープ外：5 チーム以上）。 */
export type TeamNumber = 1 | 2 | 3 | 4;

export type ClassLabel = '1部' | '2部' | '3部';

export type Team = {
  number: TeamNumber;
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
  /** status が 'waiting' のときは無い。 */
  scoreA?: number;
  scoreB?: number;
};

/** 予選リーグの「対戦（カード）」1 つ。チーム同士の総当たり戦。 */
export type LeagueCard = {
  id: string;
  teamA: TeamNumber;
  teamB: TeamNumber;
  status: CardStatus;
  /** status が 'done' | 'live' のときの、カード内の勝ち試合数。 */
  gamesWonA?: number;
  gamesWonB?: number;
  matches: CardMatch[];
};

export type StandingRow = {
  rank: number;
  teamNumber: TeamNumber;
  wins: number;
  losses: number;
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

export const sampleTeams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
  { number: 3, name: '関東' },
  { number: 4, name: '関西' },
];

export const sampleLeagueCards: LeagueCard[] = [
  {
    id: 'card-1-2',
    teamA: 1,
    teamB: 2,
    status: 'done',
    gamesWonA: 2,
    gamesWonB: 1,
    matches: [
      {
        id: 'card-1-2-1',
        classLabel: '1部',
        status: 'done',
        teamAPlayers: ['佐藤', '鈴木'],
        teamBPlayers: ['山田', '田中'],
        scoreA: 21,
        scoreB: 15,
      },
      {
        id: 'card-1-2-2',
        classLabel: '2部',
        status: 'done',
        teamAPlayers: ['高橋', '伊藤'],
        teamBPlayers: ['渡辺', '小林'],
        scoreA: 21,
        scoreB: 18,
      },
      {
        id: 'card-1-2-3',
        classLabel: '3部',
        status: 'done',
        teamAPlayers: ['中村'],
        teamBPlayers: ['加藤'],
        scoreA: 17,
        scoreB: 21,
      },
    ],
  },
  {
    id: 'card-1-3',
    teamA: 1,
    teamB: 3,
    status: 'done',
    gamesWonA: 3,
    gamesWonB: 0,
    matches: [
      {
        id: 'card-1-3-1',
        classLabel: '1部',
        status: 'done',
        teamAPlayers: ['佐藤', '鈴木'],
        teamBPlayers: ['吉田', '斎藤'],
        scoreA: 21,
        scoreB: 12,
      },
      {
        id: 'card-1-3-2',
        classLabel: '2部',
        status: 'done',
        teamAPlayers: ['高橋', '伊藤'],
        teamBPlayers: ['山本', '松本'],
        scoreA: 21,
        scoreB: 17,
      },
      {
        id: 'card-1-3-3',
        classLabel: '3部',
        status: 'done',
        teamAPlayers: ['中村'],
        teamBPlayers: ['井上'],
        scoreA: 21,
        scoreB: 19,
      },
    ],
  },
  {
    id: 'card-3-4',
    teamA: 3,
    teamB: 4,
    status: 'done',
    gamesWonA: 2,
    gamesWonB: 1,
    matches: [
      {
        id: 'card-3-4-1',
        classLabel: '1部',
        status: 'done',
        teamAPlayers: ['吉田', '斎藤'],
        teamBPlayers: ['木村', '林'],
        scoreA: 21,
        scoreB: 14,
      },
      {
        id: 'card-3-4-2',
        classLabel: '2部',
        status: 'done',
        teamAPlayers: ['山本', '松本'],
        teamBPlayers: ['清水', '山口'],
        scoreA: 15,
        scoreB: 21,
      },
      {
        id: 'card-3-4-3',
        classLabel: '3部',
        status: 'done',
        teamAPlayers: ['井上'],
        teamBPlayers: ['森'],
        scoreA: 21,
        scoreB: 18,
      },
    ],
  },
  {
    id: 'card-2-3',
    teamA: 2,
    teamB: 3,
    status: 'live',
    gamesWonA: 1,
    gamesWonB: 0,
    matches: [
      {
        id: 'card-2-3-1',
        classLabel: '1部',
        status: 'done',
        teamAPlayers: ['山田', '田中'],
        teamBPlayers: ['吉田', '斎藤'],
        scoreA: 21,
        scoreB: 16,
      },
      {
        id: 'card-2-3-2',
        classLabel: '2部',
        status: 'live',
        teamAPlayers: ['渡辺', '小林'],
        teamBPlayers: ['山本', '松本'],
        scoreA: 15,
        scoreB: 12,
      },
      {
        id: 'card-2-3-3',
        classLabel: '3部',
        status: 'waiting',
        teamAPlayers: ['加藤'],
        teamBPlayers: ['井上'],
      },
    ],
  },
  {
    id: 'card-1-4',
    teamA: 1,
    teamB: 4,
    status: 'waiting',
    matches: [
      {
        id: 'card-1-4-1',
        classLabel: '1部',
        status: 'waiting',
        teamAPlayers: ['佐藤', '鈴木'],
        teamBPlayers: ['木村', '林'],
      },
      {
        id: 'card-1-4-2',
        classLabel: '2部',
        status: 'waiting',
        teamAPlayers: ['高橋', '伊藤'],
        teamBPlayers: ['清水', '山口'],
      },
      {
        id: 'card-1-4-3',
        classLabel: '3部',
        status: 'waiting',
        teamAPlayers: ['中村'],
        teamBPlayers: ['森'],
      },
    ],
  },
  {
    id: 'card-2-4',
    teamA: 2,
    teamB: 4,
    status: 'waiting',
    matches: [
      {
        id: 'card-2-4-1',
        classLabel: '1部',
        status: 'waiting',
        teamAPlayers: ['山田', '田中'],
        teamBPlayers: ['木村', '林'],
      },
      {
        id: 'card-2-4-2',
        classLabel: '2部',
        status: 'waiting',
        teamAPlayers: ['渡辺', '小林'],
        teamBPlayers: ['清水', '山口'],
      },
      {
        id: 'card-2-4-3',
        classLabel: '3部',
        status: 'waiting',
        teamAPlayers: ['加藤'],
        teamBPlayers: ['森'],
      },
    ],
  },
];

export const sampleStandings: StandingRow[] = [
  {
    rank: 1,
    teamNumber: 1,
    wins: 2,
    losses: 0,
    gamesWon: 5,
    gamesLost: 1,
    pointDiff: 30,
    isSelf: false,
  },
  {
    rank: 2,
    teamNumber: 3,
    wins: 1,
    losses: 1,
    gamesWon: 3,
    gamesLost: 3,
    pointDiff: 5,
    isSelf: false,
  },
  {
    rank: 3,
    teamNumber: 2,
    wins: 0,
    losses: 1,
    gamesWon: 1,
    gamesLost: 2,
    pointDiff: -10,
    isSelf: true,
  },
  {
    rank: 4,
    teamNumber: 4,
    wins: 0,
    losses: 1,
    gamesWon: 1,
    gamesLost: 2,
    pointDiff: -15,
    isSelf: false,
  },
];

/** 予選リーグ中はどの枠も確定しないので、全部プレースホルダの文言にしておく。 */
export const sampleKoBracket: KoBracketData = {
  leagueFinished: false,
  semifinals: [
    {
      id: 'semifinal-1',
      roundLabel: '準決勝1',
      slotA: { label: '予選 1位', isDecided: false },
      slotB: { label: '予選 4位', isDecided: false },
      status: 'waiting',
    },
    {
      id: 'semifinal-2',
      roundLabel: '準決勝2',
      slotA: { label: '予選 2位', isDecided: false },
      slotB: { label: '予選 3位', isDecided: false },
      status: 'waiting',
    },
  ],
  final: {
    id: 'final',
    roundLabel: '決勝',
    slotA: { label: '準決勝1 勝者', isDecided: false },
    slotB: { label: '準決勝2 勝者', isDecided: false },
    status: 'waiting',
  },
  thirdPlace: {
    id: 'third-place',
    roundLabel: '3位決定戦',
    slotA: { label: '準決勝1 敗者', isDecided: false },
    slotB: { label: '準決勝2 敗者', isDecided: false },
    status: 'waiting',
  },
  champion: { decided: false },
};
