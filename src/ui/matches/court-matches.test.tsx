import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourtMatches } from '@/ui/matches/court-matches';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 1b そのコートの全試合。「終わった試合」「試合中」「これから」で分け、**隠さずに全部**出す。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const matches = [
  boardMatch({
    matchId: 'd1',
    orderInCourt: 1,
    status: 'done',
    scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
  }),
  boardMatch({
    matchId: 'd2',
    orderInCourt: 2,
    status: 'done',
    scores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 21 }],
  }),
  boardMatch({
    matchId: 'l1',
    orderInCourt: 3,
    status: 'live',
    scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
  }),
  boardMatch({ matchId: 'w1', orderInCourt: 4, status: 'waiting' }),
  boardMatch({ matchId: 'w2', orderInCourt: 5, status: 'waiting' }),
];

describe('CourtMatches', () => {
  test('終わった試合も隠れず、3 つの見出しに分かれて全部出る', () => {
    render(<CourtMatches courtNumber={1} matches={matches} />);

    expect(screen.getByRole('heading', { name: '終わった試合 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '試合中' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'これから 2' })).toBeInTheDocument();
    for (const id of ['d1', 'd2', 'l1', 'w1', 'w2']) {
      expect(screen.getByTestId(`match-row-${id}`)).toBeInTheDocument();
    }
  });

  test('見出しの順は、終わった試合 → 試合中 → これから', () => {
    render(<CourtMatches courtNumber={1} matches={matches} />);

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings.indexOf('終わった試合 2')).toBeLessThan(headings.indexOf('試合中'));
    expect(headings.indexOf('試合中')).toBeLessThan(headings.indexOf('これから 2'));
  });

  test('該当する試合の無い見出しは出ない', () => {
    render(
      <CourtMatches
        courtNumber={1}
        matches={[boardMatch({ matchId: 'w1', orderInCourt: 1, status: 'waiting' })]}
      />
    );

    expect(screen.queryByRole('heading', { name: /終わった試合/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '試合中' })).not.toBeInTheDocument();
  });

  test('コート名・状態の札・進み具合と残り試合数が出る', () => {
    render(<CourtMatches courtNumber={1} matches={matches} />);

    expect(screen.getByRole('heading', { level: 2, name: /^コート1/ })).toBeInTheDocument();
    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
    expect(screen.getByText('2/5 ・ 残り3')).toBeInTheDocument();
  });

  test('行はどれも押すと詳しい画面へ移る', () => {
    render(<CourtMatches courtNumber={1} matches={matches} />);

    const links = within(screen.getByTestId('court-matches')).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute('href', '/matches/d1');
  });
});
