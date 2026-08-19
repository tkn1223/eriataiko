import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { sampleStandings, sampleTeams } from '@/ui/bracket/sample-data';
import { StandingsTable } from '@/ui/bracket/standings-table';

describe('StandingsTable', () => {
  test('「順位表（暫定）」に 順位 / チーム / 勝敗 / ゲーム / 得失点 の 5 列が出る', () => {
    render(<StandingsTable teams={sampleTeams} rows={sampleStandings} />);

    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
    expect(screen.getByText('順位')).toBeInTheDocument();
    expect(screen.getByText('チーム')).toBeInTheDocument();
    expect(screen.getByText('勝敗')).toBeInTheDocument();
    expect(screen.getByText('ゲーム')).toBeInTheDocument();
    expect(screen.getByText('得失点')).toBeInTheDocument();
  });

  test('4 チーム分の行が、順位・勝敗・ゲーム・得失点つきで出る', () => {
    render(<StandingsTable teams={sampleTeams} rows={sampleStandings} />);

    const topRow = screen.getByTestId('standing-row-1');
    expect(within(topRow).getByText('1')).toBeInTheDocument();
    expect(within(topRow).getByText('愛知南')).toBeInTheDocument();
    expect(within(topRow).getByText('2勝0敗')).toBeInTheDocument();
    expect(within(topRow).getByText('5-1')).toBeInTheDocument();
    expect(within(topRow).getByText('+30')).toBeInTheDocument();
  });

  test('マイナスの得失点には - が付く', () => {
    render(<StandingsTable teams={sampleTeams} rows={sampleStandings} />);

    const selfRow = screen.getByTestId('standing-row-2');
    expect(within(selfRow).getByText('-10')).toBeInTheDocument();
  });

  test('自分のチームの行だけ強調表示される', () => {
    render(<StandingsTable teams={sampleTeams} rows={sampleStandings} />);

    // 色の名前や色コードは見ない（変えるたびに壊れるため）。
    // 「自分の行にだけ下地の色が付いている」ことだけを見る。
    const backgroundClasses = (row: HTMLElement) =>
      row.className.split(/\s+/).filter((name) => name.startsWith('bg-'));

    const selfRow = screen.getByTestId(
      `standing-row-${sampleStandings.find((row) => row.isSelf)!.teamNumber}`
    );
    expect(backgroundClasses(selfRow)).toHaveLength(1);

    for (const row of sampleStandings.filter((row) => !row.isSelf)) {
      expect(backgroundClasses(screen.getByTestId(`standing-row-${row.teamNumber}`))).toEqual([]);
    }
  });

  test('順位表の下に「順位は 勝敗 → ゲーム → 得失点 の順で決定」が出る', () => {
    render(<StandingsTable teams={sampleTeams} rows={sampleStandings} />);

    expect(screen.getByText('順位は 勝敗 → ゲーム → 得失点 の順で決定')).toBeInTheDocument();
  });
});
