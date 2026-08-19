import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MyPage } from '@/ui/me/my-page';
import { sampleMatches, sampleProfile, sampleRecord } from '@/ui/me/sample-data';

describe('MyPage', () => {
  test('選手の名前・チーム名・部が出る', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(screen.getByText('佐々木 太郎')).toBeInTheDocument();
    expect(screen.getByText(/アリーナクラブ\s*・\s*2部/)).toBeInTheDocument();
  });

  test('成績カードに「◯勝◯敗」「ゲーム ◯-◯」「得失点 ±◯」が出る', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(screen.getByText('3勝1敗')).toBeInTheDocument();
    expect(screen.getByText(/ゲーム\s*7-3/)).toBeInTheDocument();
    expect(screen.getByText(/得失点\s*\+21/)).toBeInTheDocument();
  });

  test('「今大会の試合」の下に試合が並ぶ', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(screen.getByText('今大会の試合')).toBeInTheDocument();
    for (const match of sampleMatches) {
      expect(screen.getByTestId(`match-${match.id}`)).toBeInTheDocument();
    }
  });

  test('勝ち◯・負け●・進行中LIVE・未実施待が、試合の状態どおりに出し分けられる', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(within(screen.getByTestId('match-match-1')).getByText('○')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-2')).getByText('●')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-3')).getByText('LIVE')).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-4')).getByText('待')).toBeInTheDocument();
  });

  test('未実施の試合は、スコアの代わりに「コート◯・◯試合目」が出る', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(
      within(screen.getByTestId('match-match-4')).getByText('コート3・2試合目')
    ).toBeInTheDocument();
  });

  test('ペアの相手がいる試合は「◯◯ とペア」、いない試合は「シングルス」と出る', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(
      within(screen.getByTestId('match-match-1')).getByText(/山田 とペア/)
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('match-match-3')).getByText(/シングルス/)).toBeInTheDocument();
  });

  test('「名前を変更」を押すと「準備中」と出て、画面は切り替わらない', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(screen.queryByText('準備中')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }));
    expect(screen.getByText('準備中')).toBeInTheDocument();
    // 画面が切り替わっていない＝見出しがそのまま残っている
    expect(screen.getByText('佐々木 太郎')).toBeInTheDocument();
  });

  test('観戦モードの表示と「新しい大会を作る」は出ない', () => {
    render(<MyPage profile={sampleProfile} record={sampleRecord} matches={sampleMatches} />);

    expect(screen.queryByText(/観戦モード/)).not.toBeInTheDocument();
    expect(screen.queryByText(/新しい大会を作る/)).not.toBeInTheDocument();
  });
});
