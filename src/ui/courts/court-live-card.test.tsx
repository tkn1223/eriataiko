import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court } from '@/ui/courts/sample-data';

const baseLive: NonNullable<Court['live']> = {
  classLabel: '2部',
  roundLabel: '予選 1回戦',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  finishedGames: [],
  currentGame: [10, 8],
};

function renderLiveCard({
  live = baseLive,
  next = null,
  finishedGames = live?.finishedGames ?? [],
  currentGame = live?.currentGame ?? [0, 0],
  onIncrement = () => {},
  onDecrement = () => {},
  onFinishGame = () => {},
}: {
  live?: Court['live'];
  next?: Court['next'];
  finishedGames?: [number, number][];
  currentGame?: [number, number];
  onIncrement?: (side: 'A' | 'B') => void;
  onDecrement?: (side: 'A' | 'B') => void;
  onFinishGame?: () => void;
} = {}) {
  const court: Court = { courtNumber: 3, live, next };
  return render(
    <CourtLiveCard
      court={court}
      liveScore={live ? { finishedGames, currentGame } : null}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onFinishGame={onFinishGame}
    />
  );
}

describe('CourtLiveCard', () => {
  test('進行中のコートに「LIVE」と部・回戦・ゲーム目が出る', () => {
    renderLiveCard();

    expect(screen.getByText('コート3')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
    expect(screen.getByText('予選 1回戦・1ゲーム目')).toBeInTheDocument();
  });

  test('終わったゲームの数だけゲーム目が進む', () => {
    renderLiveCard({ finishedGames: [[21, 15]] });

    expect(screen.getByText('予選 1回戦・2ゲーム目')).toBeInTheDocument();
  });

  test('各チームの行にペア名・「−」「＋」・得点が出る', () => {
    renderLiveCard();

    expect(screen.getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(screen.getByText('高橋・伊藤')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '佐藤・鈴木の得点を1増やす' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '佐藤・鈴木の得点を1減らす' })).toBeInTheDocument();
  });

  test('「＋」を押すと onIncrement がそのチーム側で呼ばれる', () => {
    const onIncrement = vi.fn();
    renderLiveCard({ onIncrement });

    fireEvent.click(screen.getByRole('button', { name: '高橋・伊藤の得点を1増やす' }));
    expect(onIncrement).toHaveBeenCalledWith('B');
  });

  test('「−」を押すと onDecrement がそのチーム側で呼ばれる', () => {
    const onDecrement = vi.fn();
    renderLiveCard({ onDecrement });

    fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の得点を1減らす' }));
    expect(onDecrement).toHaveBeenCalledWith('A');
  });

  test('終わったゲームが「第1ゲーム 21-15」のチップで出る', () => {
    renderLiveCard({ finishedGames: [[21, 15]] });

    expect(screen.getByText('第1ゲーム 21-15')).toBeInTheDocument();
  });

  test('終わったゲームが無いときはチップが出ない', () => {
    renderLiveCard({ finishedGames: [] });

    expect(screen.queryByText(/第\d+ゲーム/)).not.toBeInTheDocument();
  });

  test('どちらも21点未満のときは「ゲーム終了」がink色', () => {
    renderLiveCard({ currentGame: [15, 12] });

    expect(screen.getByRole('button', { name: 'ゲーム終了' })).toHaveClass('bg-ink');
  });

  test('どちらかが21点に達すると「ゲーム終了」の色が変わる', () => {
    renderLiveCard({ currentGame: [21, 15] });

    const button = screen.getByRole('button', { name: 'ゲーム終了' });
    expect(button).toHaveClass('bg-accent');
    expect(button).not.toHaveClass('bg-ink');
  });

  test('「ゲーム終了」を押すと onFinishGame が呼ばれる', () => {
    const onFinishGame = vi.fn();
    renderLiveCard({ onFinishGame });

    fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));
    expect(onFinishGame).toHaveBeenCalled();
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
