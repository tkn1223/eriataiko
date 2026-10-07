import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { LeagueMatrix } from '@/ui/bracket/league-matrix';
import type { LeagueCard, Team } from '@/ui/bracket/types';

const teams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
  { number: 3, name: '愛知北' },
  { number: 4, name: '愛知西' },
];

function card(overrides: Partial<LeagueCard> & Pick<LeagueCard, 'id' | 'teamA' | 'teamB'>) {
  return { status: 'waiting', matches: [], ...overrides } satisfies LeagueCard;
}

const cards: LeagueCard[] = [
  card({ id: 'c-1-2', teamA: 1, teamB: 2, status: 'done', gamesWonA: 2, gamesWonB: 1 }),
  card({ id: 'c-2-3', teamA: 2, teamB: 3, status: 'live', gamesWonA: 1, gamesWonB: 0 }),
  card({ id: 'c-1-4', teamA: 1, teamB: 4 }),
  card({ id: 'c-3-4', teamA: 3, teamB: 4, status: 'done', gamesWonA: 1, gamesWonB: 1 }),
];

function renderMatrix(
  overrides: { cards?: LeagueCard[]; onSelectCard?: (card: LeagueCard) => void } = {}
) {
  return render(
    <LeagueMatrix
      teams={teams}
      cards={overrides.cards ?? cards}
      onSelectCard={overrides.onSelectCard ?? (() => {})}
    />
  );
}

describe('LeagueMatrix', () => {
  test('4×4 の星取表が出る。自分同士のマスは空', () => {
    renderMatrix();

    // 4 チーム × 4 チーム - 対角線(自分同士) 4 マス = 12 マス。
    // 対戦がある 4 つ（両側から見るので 8 マス）だけが押せて、残り 4 マスは「－」
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getAllByText('－')).toHaveLength(4);
    for (const team of teams) {
      expect(
        screen.queryByRole('button', { name: `${team.name} 対 ${team.name} の対戦` })
      ).not.toBeInTheDocument();
    }
  });

  test('マスに ○ / ● /「試合中」/「未」が状態どおりに出る', () => {
    renderMatrix();

    // 愛知南が 2-1 で勝ち、愛知中央は負け
    expect(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })).toHaveTextContent(
      '○'
    );
    expect(screen.getByRole('button', { name: '愛知中央 対 愛知南 の対戦' })).toHaveTextContent(
      '●'
    );
    expect(screen.getByRole('button', { name: '愛知中央 対 愛知北 の対戦' })).toHaveTextContent(
      '試合中'
    );
    expect(screen.getByRole('button', { name: '愛知南 対 愛知西 の対戦' })).toHaveTextContent('未');
  });

  test('終わった対戦の勝ち試合数が同じマスは、○ でも ● でもなく △（引き分け）になる', () => {
    renderMatrix();

    for (const name of ['愛知北 対 愛知西 の対戦', '愛知西 対 愛知北 の対戦']) {
      const cell = screen.getByRole('button', { name });
      expect(cell).toHaveTextContent('△');
      expect(cell).not.toHaveTextContent('○');
      expect(cell).not.toHaveTextContent('●');
      expect(cell).toHaveTextContent('1-1');
    }
    // 読み上げでも意味が伝わる
    expect(screen.getAllByRole('img', { name: '引き分け' })).toHaveLength(2);
  });

  test('終了・進行中のマスにはスコア（例 2-1）が出て、未実施のマスには出ない', () => {
    renderMatrix();

    expect(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })).toHaveTextContent(
      '2-1'
    );
    // 行チームから見た数字になる（愛知中央側は 1-2）
    expect(screen.getByRole('button', { name: '愛知中央 対 愛知南 の対戦' })).toHaveTextContent(
      '1-2'
    );
    expect(screen.getByRole('button', { name: '愛知中央 対 愛知北 の対戦' })).toHaveTextContent(
      '1-0'
    );

    const waitingCell = screen.getByRole('button', { name: '愛知南 対 愛知西 の対戦' });
    expect(waitingCell).not.toHaveTextContent(/\d+-\d+/);
  });

  test('星取表の下に「○＝カード勝利、△＝引き分け…」の注記が出る', () => {
    renderMatrix();

    expect(
      screen.getByText('○＝カード勝利、△＝引き分け（数字はカード内の勝ち試合数）。タップで詳細。')
    ).toBeInTheDocument();
  });

  test('マスを押すと、そのカードを渡して onSelectCard が呼ばれる', () => {
    const onSelectCard = vi.fn();
    renderMatrix({ onSelectCard });

    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ teamA: 1, teamB: 2 }));
  });

  test('対戦が無い組み合わせは「－」が出る', () => {
    renderMatrix({ cards: cards.filter((c) => c.id !== 'c-1-4') });

    expect(
      screen.queryByRole('button', { name: '愛知南 対 愛知西 の対戦' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('－').length).toBeGreaterThan(0);
  });
});
