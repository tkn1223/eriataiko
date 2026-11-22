import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MatchRow } from '@/ui/matches/match-row';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 1b・1c の試合の行。チームごとに 2 段で、ゲームごとの点が右に並ぶ。押すと試合の詳しい画面が開く。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const teamA = {
  teamNumber: 1,
  teamName: 'あおぞら',
  players: ['ハルキ', 'ミドリ'],
  slotLabel: null,
};
const teamB = { teamNumber: 3, teamName: 'さくら', players: ['シン', 'ヒナ'], slotLabel: null };

function renderRow(overrides = {}, props = {}) {
  return render(
    <ul>
      <MatchRow
        match={boardMatch({ matchId: 'm-9', orderInCourt: 2, teamA, teamB, ...overrides })}
        {...props}
      />
    </ul>
  );
}

describe('MatchRow', () => {
  test('行を押すと、その試合の詳しい画面（/matches/[matchId]）が開く', () => {
    renderRow();

    expect(screen.getByRole('link')).toHaveAttribute('href', '/matches/m-9');
  });

  test('試合順の番号と、チームごと 2 段の選手名・チーム名が出る', () => {
    renderRow();

    const row = screen.getByTestId('match-row-m-9');
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('試合目')).toBeInTheDocument();
    expect(within(row).getByText('ハルキ・ミドリ')).toBeInTheDocument();
    expect(within(row).getByText('シン・ヒナ')).toBeInTheDocument();
    expect(within(row).getByText('あおぞら')).toBeInTheDocument();
    expect(within(row).getByText('さくら')).toBeInTheDocument();
  });

  test('終わった試合は、ゲームごとの点が各段の右に並ぶ', () => {
    renderRow({
      status: 'done',
      maxGameCount: 3,
      scores: [
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 18, sideBScore: 21 },
        { gameNumber: 3, sideAScore: 21, sideBScore: 19 },
      ],
    });

    expect(screen.getByTestId('match-row-m-9-scoreline-A')).toHaveTextContent('211821');
    expect(screen.getByTestId('match-row-m-9-scoreline-B')).toHaveTextContent('152119');
  });

  test('棄権した側の名前の横に「棄権」の札が出る', () => {
    renderRow({
      status: 'done',
      ending: 'retired_side_b',
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
    });

    const row = screen.getByTestId('match-row-m-9');
    expect(within(row).getAllByText('棄権')).toHaveLength(1);
    expect(within(row).getByTestId('match-row-m-9-line-B')).toHaveTextContent('棄権');
    expect(within(row).getByTestId('match-row-m-9-line-A')).not.toHaveTextContent('棄権');
  });

  test('試合に負けた側の名前は薄くなる', () => {
    renderRow({
      status: 'done',
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
    });

    expect(screen.getByText('シン・ヒナ').className).toMatch(/text-\[#6b665f\]/);
    expect(screen.getByText('ハルキ・ミドリ').className).not.toMatch(/text-\[#6b665f\]/);
  });

  test('試合中の行は「試合中 ・ 第Nゲーム」と、いまのゲームの点が出る', () => {
    renderRow({
      status: 'live',
      maxGameCount: 3,
      scores: [
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 12, sideBScore: 9 },
      ],
    });

    const row = screen.getByTestId('match-row-m-9');
    expect(within(row).getByText(/試合中 ・ 第2ゲーム/)).toBeInTheDocument();
    expect(screen.getByTestId('match-row-m-9-scoreline-A')).toHaveTextContent('12');
    expect(screen.getByTestId('match-row-m-9-scoreline-B')).toHaveTextContent('9');
  });

  test('これからの試合には点が出ない', () => {
    renderRow({ status: 'waiting' });

    expect(screen.getByTestId('match-row-m-9-scoreline-A')).toBeEmptyDOMElement();
  });

  test('出場者が決まっていない枠は空枠の名前（予選1位）と「予選の結果で決まる」が出る', () => {
    renderRow({
      status: 'waiting',
      roundLabel: '準決勝',
      teamA: { teamNumber: null, players: [], slotLabel: '予選1位' },
      teamB: { teamNumber: null, players: [], slotLabel: '予選4位' },
    });

    expect(screen.getByText('予選1位')).toBeInTheDocument();
    expect(screen.getByText('予選4位')).toBeInTheDocument();
    expect(screen.getByText('準決勝 ・ 予選の結果で決まる')).toBeInTheDocument();
  });

  test('場所（コート1）を渡すと行の上に出る（探す画面用）', () => {
    renderRow({ status: 'done' }, { location: 'コート1' });

    expect(screen.getByText('コート1')).toBeInTheDocument();
  });

  test('自分の試合の行は金の枠、自分が出る側の名前の横に金の点が付く', () => {
    renderRow({ isMine: true, mySide: 'A' });

    expect(screen.getByTestId('match-row-m-9').className).toMatch(/border-gold-mine/);
    expect(
      within(screen.getByTestId('match-row-m-9-line-A')).getByRole('img', { name: 'あなた' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('match-row-m-9-line-B')).queryByRole('img', { name: 'あなた' })
    ).not.toBeInTheDocument();
  });
});
