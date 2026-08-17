import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { BracketPage } from '@/ui/bracket/bracket-page';
import {
  sampleKoBracket,
  sampleLeagueCards,
  sampleStandings,
  sampleTeams,
} from '@/ui/bracket/sample-data';

function renderPage() {
  return render(
    <BracketPage
      teams={sampleTeams}
      leagueCards={sampleLeagueCards}
      standings={sampleStandings}
      koBracket={sampleKoBracket}
    />
  );
}

describe('BracketPage', () => {
  test('見出し「対戦表」が出る', () => {
    renderPage();
    expect(screen.getByText('対戦表')).toBeInTheDocument();
  });

  test('「予選リーグ」「決勝トーナメント」の切り替えが出て、押すと中身が入れ替わる', () => {
    renderPage();

    // 初期状態は予選リーグ側
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(screen.queryByText('順位表（暫定）')).not.toBeInTheDocument();
    expect(screen.getByText('準決勝')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '予選リーグ' }));
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
  });

  test('マスを押すと詳細が下から出て、その対戦の試合一覧が並ぶ。「閉じる」で閉じる', () => {
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('予選リーグ：愛知南 2-1 愛知中央')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
