import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { BracketPage } from '@/ui/bracket/bracket-page';
import type { KoBracketData, LeagueCard, StandingRow, Team } from '@/ui/bracket/types';

const teams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
];

const leagueCards: LeagueCard[] = [
  {
    id: 'card-1-2',
    teamA: 1,
    teamB: 2,
    status: 'done',
    gamesWonA: 2,
    gamesWonB: 1,
    matches: [
      {
        id: 'm-1',
        classLabel: { name: '1部', colorNumber: 1 },
        status: 'done',
        teamAPlayers: ['佐藤', '鈴木'],
        teamBPlayers: ['山田', '田中'],
        gamesWonA: 1,
        gamesWonB: 0,
      },
    ],
  },
];

const standings: StandingRow[] = [
  {
    rank: 1,
    teamNumber: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    gamesWon: 2,
    gamesLost: 1,
    pointDiff: 10,
    isSelf: false,
  },
  {
    rank: 2,
    teamNumber: 2,
    wins: 0,
    losses: 1,
    draws: 0,
    gamesWon: 1,
    gamesLost: 2,
    pointDiff: -10,
    isSelf: true,
  },
];

const waitingSlot = (label: string) => ({ label, isDecided: false });
const koBracket: KoBracketData = {
  leagueFinished: false,
  semifinals: [
    {
      id: 'semi-1',
      roundLabel: '準決勝1',
      slotA: waitingSlot('予選1位'),
      slotB: waitingSlot('予選4位'),
      status: 'waiting',
    },
    {
      id: 'semi-2',
      roundLabel: '準決勝2',
      slotA: waitingSlot('予選2位'),
      slotB: waitingSlot('予選3位'),
      status: 'waiting',
    },
  ],
  final: {
    id: 'final',
    roundLabel: '決勝',
    slotA: waitingSlot('準決勝1 勝者'),
    slotB: waitingSlot('準決勝2 勝者'),
    status: 'waiting',
  },
  thirdPlace: {
    id: 'third',
    roundLabel: '3位決定戦',
    slotA: waitingSlot('準決勝1 敗者'),
    slotB: waitingSlot('準決勝2 敗者'),
    status: 'waiting',
  },
  champion: { decided: false },
};

function renderPage(overrides: { truncated?: boolean } = {}) {
  return render(
    <BracketPage
      teams={teams}
      leagueCards={leagueCards}
      standings={standings}
      koBracket={koBracket}
      truncated={overrides.truncated ?? false}
    />
  );
}

describe('BracketPage', () => {
  test('見出し「対戦表」が出る', () => {
    renderPage();
    expect(screen.getByText('対戦表')).toBeInTheDocument();
  });

  test('「予選リーグ」「決勝トーナメント」の切り替えが出て、押すと中身が入れ替わる', () => {
    renderPage();

    // 初期状態は予選リーグ側
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(screen.queryByText('順位表（暫定）')).not.toBeInTheDocument();
    expect(screen.getByText('準決勝')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '予選リーグ' }));
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
  });

  test('マスを押すと詳細が下から出て、その対戦の試合一覧が並ぶ。「閉じる」で閉じる', () => {
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('予選リーグ：愛知南 2-1 愛知中央')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('読む上限を超えていたら、出しきれていないかもしれないと知らせる', () => {
    renderPage({ truncated: true });

    expect(screen.getByRole('alert')).toHaveTextContent('出しきれていない');
  });

  test('上限を超えていなければ、その知らせは出ない', () => {
    renderPage({ truncated: false });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
