import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StandingsTable } from '@/ui/bracket/standings-table';
import type { StandingRow, Team } from '@/ui/bracket/types';

const teams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
  { number: 3, name: '愛知北' },
];

const rows: StandingRow[] = [
  {
    rank: 1,
    teamNumber: 1,
    wins: 2,
    losses: 0,
    draws: 0,
    gamesWon: 5,
    gamesLost: 1,
    pointDiff: 30,
    isSelf: false,
  },
  {
    rank: 2,
    teamNumber: 3,
    wins: 1,
    losses: 0,
    draws: 1,
    gamesWon: 3,
    gamesLost: 3,
    pointDiff: 0,
    isSelf: false,
  },
  {
    rank: 3,
    teamNumber: 2,
    wins: 0,
    losses: 2,
    draws: 0,
    gamesWon: 1,
    gamesLost: 5,
    pointDiff: -30,
    isSelf: true,
  },
];

describe('StandingsTable', () => {
  test('「順位表（暫定）」に 順位 / チーム / 勝敗 / ゲーム / 得失点 の 5 列が出る', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
    expect(screen.getByText('順位')).toBeInTheDocument();
    expect(screen.getByText('チーム')).toBeInTheDocument();
    expect(screen.getByText('勝敗')).toBeInTheDocument();
    expect(screen.getByText('ゲーム')).toBeInTheDocument();
    expect(screen.getByText('得失点')).toBeInTheDocument();
  });

  test('各チームの行が、順位・勝敗・ゲーム・得失点つきで出る', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    const topRow = screen.getByTestId('standing-row-1');
    expect(within(topRow).getByText('1')).toBeInTheDocument();
    expect(within(topRow).getByText('愛知南')).toBeInTheDocument();
    expect(within(topRow).getByText('2勝0敗')).toBeInTheDocument();
    expect(within(topRow).getByText('5-1')).toBeInTheDocument();
    expect(within(topRow).getByText('+30')).toBeInTheDocument();
  });

  test('引き分けがあるチームだけ「◯勝◯敗◯分」と出て、無いチームは「◯勝◯敗」のまま', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    expect(within(screen.getByTestId('standing-row-3')).getByText('1勝0敗1分')).toBeInTheDocument();
    expect(within(screen.getByTestId('standing-row-1')).getByText('2勝0敗')).toBeInTheDocument();
    expect(screen.queryByText('2勝0敗0分')).not.toBeInTheDocument();
  });

  test('マイナスの得失点には - が付き、0 以上には + が付く', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    expect(within(screen.getByTestId('standing-row-2')).getByText('-30')).toBeInTheDocument();
    expect(within(screen.getByTestId('standing-row-3')).getByText('+0')).toBeInTheDocument();
  });

  test('自分のチームの行だけ強調表示される', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    // 色の名前や色コードは見ない（変えるたびに壊れるため）。
    // 「自分の行にだけ下地の色が付いている」ことだけを見る。
    const backgroundClasses = (row: HTMLElement) =>
      row.className.split(/\s+/).filter((name) => name.startsWith('bg-'));

    expect(backgroundClasses(screen.getByTestId('standing-row-2'))).toHaveLength(1);
    for (const row of rows.filter((row) => !row.isSelf)) {
      expect(backgroundClasses(screen.getByTestId(`standing-row-${row.teamNumber}`))).toEqual([]);
    }
  });

  test('順位表の下に「順位は 勝敗 → ゲーム → 得失点 の順で決定」が出る', () => {
    render(<StandingsTable teams={teams} rows={rows} />);

    expect(screen.getByText('順位は 勝敗 → ゲーム → 得失点 の順で決定')).toBeInTheDocument();
  });
});
