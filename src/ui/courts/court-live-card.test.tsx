import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court } from '@/ui/courts/types';

const baseLive: NonNullable<Court['live']> = {
  matchId: 'match-1',
  status: 'live',
  classLabel: '2部',
  roundLabel: '予選 1回戦',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  maxGameCount: 1,
  games: [[10, 8]],
};

function renderLiveCard({
  live = baseLive,
  next = null,
  canEdit = true,
  onIncrement = () => {},
  onDecrement = () => {},
}: {
  live?: Court['live'];
  next?: Court['next'];
  canEdit?: boolean;
  onIncrement?: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement?: (gameNumber: number, side: 'A' | 'B') => void;
} = {}) {
  const court: Court = { courtNumber: 3, live, next };
  return render(
    <CourtLiveCard
      court={court}
      liveScore={live ? { games: live.games } : null}
      canEdit={canEdit}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
    />
  );
}

describe('CourtLiveCard', () => {
  test('進行中のコートに部・回戦が出る', () => {
    renderLiveCard();

    expect(screen.getByText('コート3')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
    expect(screen.getByText('予選 1回戦')).toBeInTheDocument();
  });

  test('status が live のときは「LIVE」が出る', () => {
    renderLiveCard({ live: { ...baseLive, status: 'live' } });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  test('status が waiting のときは「LIVE」が出ない（まだ 1 点も入っていない）', () => {
    renderLiveCard({ live: { ...baseLive, status: 'waiting' } });
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  test('ゲームの枠が max_game_count 個ならぶ', () => {
    renderLiveCard({
      live: {
        ...baseLive,
        maxGameCount: 3,
        games: [
          [21, 15],
          [10, 8],
          [0, 0],
        ],
      },
    });

    expect(screen.getByText('第1ゲーム目')).toBeInTheDocument();
    expect(screen.getByText('第2ゲーム目')).toBeInTheDocument();
    expect(screen.getByText('第3ゲーム目')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  test('「ゲーム終了」ボタンは無い', () => {
    renderLiveCard();
    expect(screen.queryByRole('button', { name: 'ゲーム終了' })).not.toBeInTheDocument();
  });

  test('各チームの行にペア名・得点が出る', () => {
    renderLiveCard();

    expect(screen.getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(screen.getByText('高橋・伊藤')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  test('入場した参加者には＋−ボタンが出る', () => {
    renderLiveCard({ canEdit: true });

    expect(screen.getByRole('button', { name: '佐藤・鈴木の得点を1増やす' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '佐藤・鈴木の得点を1減らす' })).toBeInTheDocument();
  });

  test('観戦者には＋−ボタンが出ない', () => {
    renderLiveCard({ canEdit: false });

    expect(
      screen.queryByRole('button', { name: '佐藤・鈴木の得点を1増やす' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '佐藤・鈴木の得点を1減らす' })
    ).not.toBeInTheDocument();
  });

  test('「＋」を押すと、そのゲーム番号・チーム側で onIncrement が呼ばれる', () => {
    const onIncrement = vi.fn();
    renderLiveCard({
      onIncrement,
      live: {
        ...baseLive,
        maxGameCount: 2,
        games: [
          [10, 8],
          [0, 0],
        ],
      },
    });

    fireEvent.click(screen.getAllByRole('button', { name: '高橋・伊藤の得点を1増やす' })[1]);
    expect(onIncrement).toHaveBeenCalledWith(2, 'B');
  });

  test('「−」を押すと、そのゲーム番号・チーム側で onDecrement が呼ばれる', () => {
    const onDecrement = vi.fn();
    renderLiveCard({ onDecrement });

    fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の得点を1減らす' }));
    expect(onDecrement).toHaveBeenCalledWith(1, 'A');
  });

  test('自分の試合中のコートに「あなたの試合」の印が出る', () => {
    renderLiveCard({ live: { ...baseLive, isMine: true } });

    expect(screen.getByText('あなたの試合')).toBeInTheDocument();
  });

  test('自分の試合でないコートには「あなたの試合」の印が出ない', () => {
    renderLiveCard({ live: { ...baseLive, isMine: false } });

    expect(screen.queryByText('あなたの試合')).not.toBeInTheDocument();
  });

  test('次の試合があるコートには「次」と部・ペア名が出る', () => {
    renderLiveCard({
      next: {
        classLabel: '1部',
        teamA: { number: 3, players: ['山田'] },
        teamB: { number: 4, players: ['中村'] },
        isMine: false,
      },
    });

    expect(screen.getByText('次')).toBeInTheDocument();
    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByText('山田 vs 中村')).toBeInTheDocument();
  });

  test('次の試合が無いコートには「次」が出ない', () => {
    renderLiveCard({ next: null });

    expect(screen.queryByText('次')).not.toBeInTheDocument();
  });

  test('次が自分の試合のときは名前がaccent色で強調される', () => {
    renderLiveCard({
      next: {
        classLabel: '1部',
        teamA: { number: 3, players: ['山田'] },
        teamB: { number: 4, players: ['中村'] },
        isMine: true,
      },
    });

    expect(screen.getByText('山田 vs 中村')).toHaveClass('text-accent');
  });

  test('進行中の試合が無いコートに「呼出待ち」が次の試合と一緒に出る', () => {
    renderLiveCard({
      live: null,
      next: {
        classLabel: '1部',
        teamA: { number: 1, players: ['山田'] },
        teamB: { number: 2, players: ['中村'] },
        isMine: false,
      },
    });

    expect(screen.getByText('呼出待ち')).toBeInTheDocument();
    expect(screen.getByText('山田 vs 中村')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  test('進行中の試合も次の試合も無いコートに「予定なし」が出る', () => {
    renderLiveCard({ live: null, next: null });

    expect(screen.getByText('予定なし')).toBeInTheDocument();
    expect(screen.queryByText('次')).not.toBeInTheDocument();
  });
});

// 押せるところの大きさは jsdom では測れない（クラス名を見るだけでは実寸を保証できない）。
// 実寸は e2e/courts.spec.ts で Playwright に測らせている。
