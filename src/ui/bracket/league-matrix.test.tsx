import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { LeagueMatrix } from '@/ui/bracket/league-matrix';
import { sampleLeagueCards, sampleTeams } from '@/ui/bracket/sample-data';

describe('LeagueMatrix', () => {
  test('4×4 の星取表が出る。自分同士のマスは空', () => {
    render(<LeagueMatrix teams={sampleTeams} cards={sampleLeagueCards} onSelectCard={() => {}} />);

    // 4 チーム × 4 チーム - 対角線(自分同士) 4 マス = 12 個の押せるマス
    expect(screen.getAllByRole('button')).toHaveLength(12);
    for (const team of sampleTeams) {
      expect(
        screen.queryByRole('button', { name: `${team.name} 対 ${team.name} の対戦` })
      ).not.toBeInTheDocument();
    }
  });

  test('マスに ○ / ● /「試合中」/「未」が状態どおりに出る', () => {
    render(<LeagueMatrix teams={sampleTeams} cards={sampleLeagueCards} onSelectCard={() => {}} />);

    // card-1-2: 愛知南(A) が 2-1 で勝ち、愛知中央(B) は負け
    expect(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })).toHaveTextContent(
      '○'
    );
    expect(screen.getByRole('button', { name: '愛知中央 対 愛知南 の対戦' })).toHaveTextContent(
      '●'
    );

    // card-2-3: 進行中
    expect(screen.getByRole('button', { name: '愛知中央 対 関東 の対戦' })).toHaveTextContent(
      '試合中'
    );

    // card-1-4: 未実施
    expect(screen.getByRole('button', { name: '愛知南 対 関西 の対戦' })).toHaveTextContent('未');
  });

  test('終了・進行中のマスにはスコア（例 2-1）が出て、未実施のマスには出ない', () => {
    render(<LeagueMatrix teams={sampleTeams} cards={sampleLeagueCards} onSelectCard={() => {}} />);

    expect(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' })).toHaveTextContent(
      '2-1'
    );
    expect(screen.getByRole('button', { name: '愛知中央 対 関東 の対戦' })).toHaveTextContent(
      '1-0'
    );

    const waitingCell = screen.getByRole('button', { name: '愛知南 対 関西 の対戦' });
    expect(waitingCell).not.toHaveTextContent(/\d+-\d+/);
  });

  test('星取表の下に「○＝カード勝利…」の注記が出る', () => {
    render(<LeagueMatrix teams={sampleTeams} cards={sampleLeagueCards} onSelectCard={() => {}} />);

    expect(
      screen.getByText('○＝カード勝利（数字はカード内の勝ち試合数）。タップで詳細。')
    ).toBeInTheDocument();
  });

  test('マスを押すと、そのカードを渡して onSelectCard が呼ばれる', () => {
    const onSelectCard = vi.fn();
    render(
      <LeagueMatrix teams={sampleTeams} cards={sampleLeagueCards} onSelectCard={onSelectCard} />
    );

    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    expect(onSelectCard).toHaveBeenCalledWith(expect.objectContaining({ teamA: 1, teamB: 2 }));
  });

  test('対戦が無い組み合わせは「－」が出る', () => {
    const cardsWithoutOneMatch = sampleLeagueCards.filter((card) => card.id !== 'card-1-4');
    render(
      <LeagueMatrix teams={sampleTeams} cards={cardsWithoutOneMatch} onSelectCard={() => {}} />
    );

    expect(screen.queryByRole('button', { name: '愛知南 対 関西 の対戦' })).not.toBeInTheDocument();
    expect(screen.getAllByText('－').length).toBeGreaterThan(0);
  });
});
