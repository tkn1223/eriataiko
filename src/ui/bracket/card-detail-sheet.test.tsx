import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CardDetailSheet } from '@/ui/bracket/card-detail-sheet';
import type { LeagueCard, Team } from '@/ui/bracket/types';

const teams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
];

const doneCard: LeagueCard = {
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
    {
      id: 'm-2',
      classLabel: { name: '2部', colorNumber: 2 },
      status: 'live',
      teamAPlayers: ['高橋', '伊藤'],
      teamBPlayers: ['渡辺', '小林'],
      gamesWonA: 0,
      gamesWonB: 1,
    },
    {
      id: 'm-3',
      classLabel: { name: '3部', colorNumber: 3 },
      status: 'waiting',
      teamAPlayers: ['中村'],
      teamBPlayers: ['加藤'],
    },
  ],
};

const waitingCard: LeagueCard = {
  id: 'card-1-2-waiting',
  teamA: 1,
  teamB: 2,
  status: 'waiting',
  matches: [doneCard.matches[2]],
};

const drawCard: LeagueCard = { ...doneCard, gamesWonA: 1, gamesWonB: 1 };

describe('CardDetailSheet', () => {
  test('card が null のときは何も出ない', () => {
    render(<CardDetailSheet card={null} teams={teams} onClose={() => {}} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('見出しに「予選リーグ：A ◯-◯ B」が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    expect(screen.getByText('予選リーグ：愛知南 2-1 愛知中央')).toBeInTheDocument();
  });

  test('引き分けの対戦の見出しにも数字が出る', () => {
    render(<CardDetailSheet card={drawCard} teams={teams} onClose={() => {}} />);

    expect(screen.getByText('予選リーグ：愛知南 1-1 愛知中央')).toBeInTheDocument();
  });

  // 「0-0」と出すと「0 対 0 で終わった」と読めてしまうため（受け入れ基準には無いが当日の混乱のもと）
  test('未実施の対戦の詳細を開いても、見出しにスコアは出ない（「愛知南 vs 愛知中央」と出る）', () => {
    render(<CardDetailSheet card={waitingCard} teams={teams} onClose={() => {}} />);

    expect(screen.getByText('予選リーグ：愛知南 vs 愛知中央')).toBeInTheDocument();
    expect(screen.queryByText(/0-0/)).not.toBeInTheDocument();
  });

  test('その対戦の試合一覧が、部のラベル・両ペアの名前・ゲーム数つきで並ぶ', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    const done = screen.getByTestId('card-match-m-1');
    expect(within(done).getByText('1部')).toBeInTheDocument();
    expect(within(done).getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(within(done).getByText('山田・田中')).toBeInTheDocument();
    expect(within(done).getByText('1-0')).toBeInTheDocument();

    const live = screen.getByTestId('card-match-m-2');
    expect(within(live).getByText('0-1')).toBeInTheDocument();
  });

  test('まだの試合はゲーム数の代わりに「未」が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    const waiting = screen.getByTestId('card-match-m-3');
    expect(within(waiting).getByText('未')).toBeInTheDocument();
    expect(within(waiting).queryByText(/\d+-\d+/)).not.toBeInTheDocument();
  });

  test('進行中の試合には LIVE が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    expect(within(screen.getByTestId('card-match-m-2')).getByText('LIVE')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('card-match-m-1')).queryByText('LIVE')
    ).not.toBeInTheDocument();
  });

  test('「閉じる」を押すと閉じる（onClose が呼ばれる）', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(onClose).toHaveBeenCalled();
  });

  test('背景の暗い部分を押すと閉じる', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '背景' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Esc キーを押すと閉じる', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
