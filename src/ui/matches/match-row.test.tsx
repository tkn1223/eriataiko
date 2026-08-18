import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MatchRow } from '@/ui/matches/match-row';
import type { CourtMatch } from '@/ui/matches/sample-data';

const doneMatch: CourtMatch = {
  id: 'm-done',
  orderInCourt: 1,
  classLabel: '1部',
  roundLabel: '予選 1回戦',
  status: 'done',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  finishedGames: [
    [21, 15],
    [21, 18],
  ],
};

const liveMatch: CourtMatch = {
  id: 'm-live',
  orderInCourt: 3,
  classLabel: '2部',
  roundLabel: '予選 2回戦',
  status: 'live',
  teamA: { number: 3, players: ['渡辺'] },
  teamB: { number: 4, players: ['山本'] },
  isMine: true,
  finishedGames: [[21, 19]],
  currentGame: [10, 8],
};

const waitingMatch: CourtMatch = {
  id: 'm-waiting',
  orderInCourt: 5,
  classLabel: '3部',
  roundLabel: '予選 3回戦',
  status: 'waiting',
  teamA: { number: 1, players: ['中村'] },
  teamB: { number: 2, players: ['木村'] },
  isMine: false,
  finishedGames: [],
};

describe('MatchRow', () => {
  test('試合の行に 試合順・部・両ペアの名前・スコアが出る', () => {
    render(<MatchRow match={doneMatch} onSelect={() => {}} />);

    const row = screen.getByTestId('match-row-m-done');
    expect(row).toHaveTextContent('1試合目');
    expect(row).toHaveTextContent('1部');
    expect(row).toHaveTextContent('佐藤・鈴木');
    expect(row).toHaveTextContent('高橋・伊藤');
    expect(row).toHaveTextContent('21-15 / 21-18');
  });

  test('進行中の行には「LIVE」が出る', () => {
    render(<MatchRow match={liveMatch} onSelect={() => {}} />);

    expect(screen.getByTestId('match-row-m-live')).toHaveTextContent('LIVE');
  });

  test('終了・未実施の行には「LIVE」が出ない', () => {
    render(<MatchRow match={doneMatch} onSelect={() => {}} />);
    expect(screen.getByTestId('match-row-m-done')).not.toHaveTextContent('LIVE');

    render(<MatchRow match={waitingMatch} onSelect={() => {}} />);
    expect(screen.getByTestId('match-row-m-waiting')).not.toHaveTextContent('LIVE');
  });

  test('自分の試合には「あなたの試合」の印が出る', () => {
    render(<MatchRow match={liveMatch} onSelect={() => {}} />);
    expect(screen.getByTestId('match-row-m-live')).toHaveTextContent('あなたの試合');
  });

  test('自分の試合でなければ「あなたの試合」の印は出ない', () => {
    render(<MatchRow match={doneMatch} onSelect={() => {}} />);
    expect(screen.getByTestId('match-row-m-done')).not.toHaveTextContent('あなたの試合');
  });

  test('進行中の行を押すと onSelect が呼ばれる', () => {
    const onSelect = vi.fn();
    render(<MatchRow match={liveMatch} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalled();
  });

  test('終わった試合・これからの試合の行は押せない（ボタンが無い）', () => {
    render(<MatchRow match={doneMatch} onSelect={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    render(<MatchRow match={waitingMatch} onSelect={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('未実施の試合にはスコアが出ない', () => {
    render(<MatchRow match={waitingMatch} onSelect={() => {}} />);
    // 「5試合目」の丸い印には数字があるが、スコアの「◯-◯」表記は出ない
    expect(screen.queryByText(/^\d+-\d+$/)).not.toBeInTheDocument();
  });
});
