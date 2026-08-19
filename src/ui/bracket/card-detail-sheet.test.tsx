import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CardDetailSheet } from '@/ui/bracket/card-detail-sheet';
import { sampleLeagueCards, sampleTeams } from '@/ui/bracket/sample-data';

const card = sampleLeagueCards.find((c) => c.id === 'card-1-2')!;
const liveCard = sampleLeagueCards.find((c) => c.id === 'card-2-3')!;
const waitingCard = sampleLeagueCards.find((c) => c.id === 'card-1-4')!;

describe('CardDetailSheet', () => {
  test('card が null のときは何も出ない', () => {
    render(<CardDetailSheet card={null} teams={sampleTeams} onClose={() => {}} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('見出しに「予選リーグ：A ◯-◯ B」が出る', () => {
    render(<CardDetailSheet card={card} teams={sampleTeams} onClose={() => {}} />);

    expect(screen.getByText('予選リーグ：愛知南 2-1 愛知中央')).toBeInTheDocument();
  });

  // 「0-0」と出すと「0 対 0 で終わった」と読めてしまうため（受け入れ基準には無いが当日の混乱のもと）
  test('未実施の対戦の詳細を開いても、見出しにスコアは出ない（「愛知南 vs 関西」と出る）', () => {
    render(<CardDetailSheet card={waitingCard} teams={sampleTeams} onClose={() => {}} />);

    expect(screen.getByText('予選リーグ：愛知南 vs 関西')).toBeInTheDocument();
    expect(screen.queryByText(/0-0/)).not.toBeInTheDocument();
  });

  test('その対戦の試合一覧が、部のラベル・両ペアの名前・スコアつきで並ぶ', () => {
    render(<CardDetailSheet card={card} teams={sampleTeams} onClose={() => {}} />);

    for (const match of card.matches) {
      const row = screen.getByTestId(`card-match-${match.id}`);
      expect(within(row).getByText(match.classLabel)).toBeInTheDocument();
      expect(within(row).getByText(match.teamAPlayers.join('・'))).toBeInTheDocument();
      expect(within(row).getByText(match.teamBPlayers.join('・'))).toBeInTheDocument();
      expect(within(row).getByText(`${match.scoreA}-${match.scoreB}`)).toBeInTheDocument();
    }
  });

  test('進行中の試合には LIVE が出る', () => {
    render(<CardDetailSheet card={liveCard} teams={sampleTeams} onClose={() => {}} />);

    const liveMatch = liveCard.matches.find((m) => m.status === 'live')!;
    const row = screen.getByTestId(`card-match-${liveMatch.id}`);
    expect(within(row).getByText('LIVE')).toBeInTheDocument();
  });

  test('「閉じる」を押すと閉じる（onClose が呼ばれる）', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={card} teams={sampleTeams} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(onClose).toHaveBeenCalled();
  });

  test('背景の暗い部分を押すと閉じる', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={card} teams={sampleTeams} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '背景' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('Esc キーを押すと閉じる', () => {
    const onClose = vi.fn();
    render(<CardDetailSheet card={card} teams={sampleTeams} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
