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
      winner: 'A',
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

  test('見出し「予選リーグ・対戦詳細」が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: '予選リーグ・対戦詳細' })).toBeInTheDocument();
  });

  test('終わった対戦は、状態「終了した対戦」・真ん中に「2-1」・「○ 愛知南の勝利」が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    const result = screen.getByTestId('card-result');
    expect(within(result).getByText('終了した対戦')).toBeInTheDocument();
    expect(within(result).getByText('愛知南')).toBeInTheDocument();
    expect(within(result).getByText('愛知中央')).toBeInTheDocument();
    expect(within(result).getByTestId('card-result-score')).toHaveTextContent('2-1');
    expect(within(result).getByText('○ 愛知南の勝利')).toBeInTheDocument();
  });

  test('引き分けの対戦は「△ 引き分け」が出る', () => {
    render(<CardDetailSheet card={drawCard} teams={teams} onClose={() => {}} />);

    const result = screen.getByTestId('card-result');
    expect(within(result).getByTestId('card-result-score')).toHaveTextContent('1-1');
    expect(within(result).getByText('△ 引き分け')).toBeInTheDocument();
  });

  // 「0-0」と出すと「0 対 0 で終わった」と読めてしまうため
  test('まだの対戦は、状態「まだの対戦」・真ん中は「vs」で、勝ち負けの一言は出ない', () => {
    render(<CardDetailSheet card={waitingCard} teams={teams} onClose={() => {}} />);

    const result = screen.getByTestId('card-result');
    expect(within(result).getByText('まだの対戦')).toBeInTheDocument();
    expect(within(result).getByTestId('card-result-score')).toHaveTextContent('vs');
    expect(within(result).queryByText(/勝利|引き分け/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0-0/)).not.toBeInTheDocument();
  });

  test('試合中の対戦は、状態「試合中の対戦」と今の数字が出る。勝ちの一言は出ない', () => {
    const liveCard: LeagueCard = { ...doneCard, status: 'live', gamesWonA: 1, gamesWonB: 0 };
    render(<CardDetailSheet card={liveCard} teams={teams} onClose={() => {}} />);

    const result = screen.getByTestId('card-result');
    expect(within(result).getByText('試合中の対戦')).toBeInTheDocument();
    expect(within(result).getByTestId('card-result-score')).toHaveTextContent('1-0');
    expect(within(result).queryByText(/勝利/)).not.toBeInTheDocument();
  });

  test('自分のチームの下にだけ「自分のチーム」が出る', () => {
    const { unmount } = render(
      <CardDetailSheet card={doneCard} teams={teams} selfTeamNumber={2} onClose={() => {}} />
    );
    const result = screen.getByTestId('card-result');
    expect(within(result).getAllByText('自分のチーム')).toHaveLength(1);
    unmount();

    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);
    expect(screen.queryByText('自分のチーム')).not.toBeInTheDocument();
  });

  test('部ごとのカードに、部の札・状態・両ペアの名前・ゲーム数が並ぶ', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    const done = screen.getByTestId('card-match-m-1');
    expect(within(done).getByText('1部')).toBeInTheDocument();
    expect(within(done).getByText('終了')).toBeInTheDocument();
    expect(within(done).getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(within(done).getByText('山田・田中')).toBeInTheDocument();
    expect(within(done).getByTestId('games-a')).toHaveTextContent('1');
    expect(within(done).getByTestId('games-b')).toHaveTextContent('0');

    const live = screen.getByTestId('card-match-m-2');
    expect(within(live).getByText('試合中')).toBeInTheDocument();
    expect(within(live).getByTestId('games-a')).toHaveTextContent('0');
    expect(within(live).getByTestId('games-b')).toHaveTextContent('1');
  });

  test('まだの試合は状態が「未実施」で、ゲーム数は数字の代わりに「―」が出る', () => {
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);

    const waiting = screen.getByTestId('card-match-m-3');
    expect(within(waiting).getByText('未実施')).toBeInTheDocument();
    expect(within(waiting).getByTestId('games-a')).toHaveTextContent('―');
    expect(within(waiting).queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  test('黒いボタン「星取表に戻る」を押すと閉じる（onClose が呼ばれる）', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={doneCard} teams={teams} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '星取表に戻る' }));
    expect(onClose).toHaveBeenCalled();
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

describe('CardDetailSheet と棄権', () => {
  // 点数は A が 1-0 でリードだが、A 側が棄権したので B の勝ち
  const retiredCard: LeagueCard = {
    ...doneCard,
    matches: [
      {
        ...doneCard.matches[0],
        winner: 'B',
        retiredSide: 'A',
      },
    ],
  };

  test('棄権した側の負けとして、相手のペアが太字になる（ゲーム数は点数のまま）', () => {
    render(<CardDetailSheet card={retiredCard} teams={teams} onClose={() => {}} />);

    const row = screen.getByTestId('card-match-m-1');
    expect(within(row).getByText('山田・田中')).toHaveClass('font-black');
    expect(within(row).getByText('佐藤・鈴木')).toHaveClass('text-gray-500');
    expect(within(row).getByTestId('games-a')).toHaveTextContent('1');
    expect(within(row).getByTestId('games-b')).toHaveTextContent('0');
  });

  test('「（佐藤・鈴木 棄権）」と添えられる。棄権の無い試合には出ない', () => {
    const { unmount } = render(
      <CardDetailSheet card={retiredCard} teams={teams} onClose={() => {}} />
    );
    expect(screen.getByText('（佐藤・鈴木 棄権）')).toBeInTheDocument();
    unmount();

    render(<CardDetailSheet card={doneCard} teams={teams} onClose={() => {}} />);
    expect(screen.queryByText(/棄権/)).not.toBeInTheDocument();
  });
});
