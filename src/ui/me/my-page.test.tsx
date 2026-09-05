import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MyPage } from '@/ui/me/my-page';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/types';

const profile: MyProfile = {
  name: '佐々木 太郎',
  teamName: 'アリーナクラブ',
  teamNumber: 2,
  classLabel: '2部',
};

const record: MyRecord = {
  wins: 3,
  losses: 1,
  gamesWon: 7,
  gamesLost: 3,
  pointDiff: 21,
};

const matches: MyMatch[] = [
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
    // 進行中はゲーム数を渡さない（2 ゲーム目は決着していない）
    gameScores: [
      [21, 17],
      [5, 3],
    ],
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
  {
    id: 'match-5',
    status: 'waiting',
    roundLabel: '決勝トーナメント 3位決定戦',
    classLabel: '2部',
    opponentNames: ['中村'],
    courtNumber: null,
  },
];

describe('MyPage', () => {
  test('選手の名前・チーム名・部が出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(screen.getByText('佐々木 太郎')).toBeInTheDocument();
    expect(screen.getByText(/アリーナクラブ\s*・\s*2部/)).toBeInTheDocument();
  });

  test('チーム無しのときは灰色のアバターで、サブ行は部だけになる', () => {
    const soloProfile: MyProfile = { ...profile, teamName: null, teamNumber: null };
    render(<MyPage profile={soloProfile} record={record} matches={[]} />);

    expect(screen.queryByText(/アリーナクラブ/)).not.toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
  });

  test('成績カードに「◯勝◯敗」「ゲーム ◯-◯」「得失点 ±◯」が出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(screen.getByText('3勝1敗')).toBeInTheDocument();
    expect(screen.getByText(/ゲーム\s*7-3/)).toBeInTheDocument();
    expect(screen.getByText(/得失点\s*\+21/)).toBeInTheDocument();
  });

  test('「今大会の試合」の下に試合が並ぶ', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(screen.getByText('今大会の試合')).toBeInTheDocument();
    for (const match of matches) {
      expect(screen.getByTestId(`match-${match.id}`)).toBeInTheDocument();
    }
  });

  test('勝ち◯・負け●・進行中LIVE・未実施待が、試合の状態どおりに出し分けられる', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(within(screen.getByTestId('match-match-1')).getByText('○')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-2')).getByText('●')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-3')).getByText('LIVE')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-4')).getByText('待')).toBeInTheDocument();
  });

  test('進行中の試合にはゲーム数を出さず、各ゲームの得点だけ出す', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    const live = within(screen.getByTestId('match-match-3'));
    expect(live.queryByTestId('game-count')).not.toBeInTheDocument();
    // ゲーム数の行を空のまま置くと「-」だけが残るので、それも出ていないことを見る
    expect(live.queryByText('-')).not.toBeInTheDocument();
    expect(live.getByText('21-17 / 5-3')).toBeInTheDocument();
  });

  test('終了した試合にはゲーム数と各ゲームの得点が出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    const done = within(screen.getByTestId('match-match-1'));
    expect(done.getByTestId('game-count')).toHaveTextContent('2-0');
    expect(done.getByText('21-15 / 21-18')).toBeInTheDocument();
  });

  test('未実施の試合は、スコアの代わりに「コート◯・◯試合目」が出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(
      within(screen.getByTestId('match-match-4')).getByText('コート3・2試合目')
    ).toBeInTheDocument();
  });

  test('コートが未定の未実施試合は「コート未定」と出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(within(screen.getByTestId('match-match-5')).getByText('コート未定')).toBeInTheDocument();
  });

  test('コートだけ決まって順番がまだの試合は「コート◯」だけ出る', () => {
    const courtOnly: MyMatch = {
      id: 'court-only',
      status: 'waiting',
      roundLabel: '予選 3回戦',
      classLabel: '2部',
      opponentNames: ['中村'],
      courtNumber: 2,
    };
    render(<MyPage profile={profile} record={record} matches={[courtOnly]} />);

    expect(within(screen.getByTestId('match-court-only')).getByText('コート2')).toBeInTheDocument();
  });

  test('ペアの相手がいる試合は「◯◯ とペア」、いない試合は「シングルス」と出る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    // 名前と「とペア」は別々の span（狭い画面で語の間だけ折り返せるようにするため）
    expect(screen.getByTestId('match-match-1')).toHaveTextContent('山田 とペア');
    expect(within(screen.getByTestId('match-match-3')).getByText(/シングルス/)).toBeInTheDocument();
  });

  test('「別の人として入り直す」を押すと入場画面（/enter）に移る', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    const link = screen.getByRole('link', { name: '別の人として入り直す' });
    expect(link).toHaveAttribute('href', '/enter');
  });

  test('「準備中」の表示や「観戦モード」「新しい大会を作る」は出ない', () => {
    render(<MyPage profile={profile} record={record} matches={matches} />);

    expect(screen.queryByText('準備中')).not.toBeInTheDocument();
    expect(screen.queryByText(/観戦モード/)).not.toBeInTheDocument();
    expect(screen.queryByText(/新しい大会を作る/)).not.toBeInTheDocument();
  });
});
