import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court, LiveScore } from '@/ui/courts/sample-data';

const baseLive: NonNullable<Court['live']> = {
  classLabel: '2部',
  roundLabel: '予選 1回戦',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  finishedGames: [],
  currentGame: [10, 8],
  maxGameCount: 1,
};

function renderLiveCard({
  live = baseLive,
  next = null,
  finishedGames = live?.finishedGames ?? [],
  currentGame = live?.currentGame ?? [0, 0],
  finished = false,
  onIncrement = () => {},
  onDecrement = () => {},
  onFinishGame = () => {},
}: {
  live?: Court['live'];
  next?: Court['next'];
  finishedGames?: [number, number][];
  currentGame?: [number, number];
  finished?: boolean;
  onIncrement?: (side: 'A' | 'B') => void;
  onDecrement?: (side: 'A' | 'B') => void;
  onFinishGame?: () => void;
} = {}) {
  const court: Court = { courtNumber: 3, live, next };
  const liveScore: LiveScore | null = live ? { finishedGames, currentGame, finished } : null;
  return render(
    <CourtLiveCard
      court={court}
      liveScore={liveScore}
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

  describe('「ゲーム終了」を押したとき', () => {
    test('0対0で押すと「まだ点が入っていません」と出て、確認画面は出ない', () => {
      renderLiveCard({ currentGame: [0, 0] });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByRole('status')).toHaveTextContent('まだ点が入っていません');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('同点で押すと「同点では終了できません」と出て、確認画面は出ない', () => {
      renderLiveCard({ currentGame: [15, 15] });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByRole('status')).toHaveTextContent('同点では終了できません');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('それ以外のときは確認画面が出て、まだ画面は変わらない', () => {
      renderLiveCard({ currentGame: [21, 19] });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // まだゲームは確定していないので、得点はそのまま
      expect(screen.getByText('21', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('19', { exact: true })).toBeInTheDocument();
    });

    test('確認画面に、そのゲームの得点と勝ったペアが出る', () => {
      renderLiveCard({ currentGame: [21, 19] });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByText('21 - 19', { exact: false })).toBeInTheDocument();
      expect(screen.getByText(/このゲームの勝ち/)).toBeInTheDocument();
    });

    test('予選（上限1ゲーム）で押すと、確認画面の見出しが「この試合を終了します」になる', () => {
      renderLiveCard({ live: { ...baseLive, maxGameCount: 1 }, currentGame: [21, 19] });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
      expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
    });

    test('決勝（上限3ゲーム）の第1ゲームで押すと、確認画面の見出しが「第1ゲームを終了します」になる', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        finishedGames: [],
        currentGame: [21, 19],
      });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));

      expect(screen.getByText('第1ゲームを終了します')).toBeInTheDocument();
      expect(screen.queryByText(/試合の勝ち/)).not.toBeInTheDocument();
    });

    test('「戻る」を押すと何も変わらずに閉じる', () => {
      const onFinishGame = vi.fn();
      renderLiveCard({ currentGame: [21, 19], onFinishGame });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));
      fireEvent.click(screen.getByRole('button', { name: '戻る' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onFinishGame).not.toHaveBeenCalled();
    });

    test('「OK」を押すと onFinishGame が呼ばれる', () => {
      const onFinishGame = vi.fn();
      renderLiveCard({ currentGame: [21, 19], onFinishGame });

      fireEvent.click(screen.getByRole('button', { name: 'ゲーム終了' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onFinishGame).toHaveBeenCalled();
    });
  });

  describe('終了したコート', () => {
    const finishedLive: NonNullable<Court['live']> = {
      ...baseLive,
      maxGameCount: 1,
    };

    function renderFinished() {
      return renderLiveCard({
        live: finishedLive,
        finishedGames: [[21, 15]],
        currentGame: [0, 0],
        finished: true,
      });
    }

    test('右の「LIVE」が「終了」になる', () => {
      renderFinished();

      expect(screen.getByText('終了')).toBeInTheDocument();
      expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    });

    test('「−」「＋」「ゲーム終了」が消える', () => {
      renderFinished();

      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ゲーム終了' })).not.toBeInTheDocument();
    });

    test('「◯ゲーム目」が消える', () => {
      renderFinished();

      // 終わったのに「2ゲーム目」と出ると、まだ続くように見える
      expect(screen.getByText('予選 1回戦')).toBeInTheDocument();
      expect(screen.queryByText(/ゲーム目/)).not.toBeInTheDocument();
    });

    test('各ゲームの結果のチップが残る', () => {
      renderFinished();

      expect(screen.getByText('第1ゲーム 21-15')).toBeInTheDocument();
    });

    test('「勝ち: 佐藤・鈴木（1-0）」が出る', () => {
      renderFinished();

      expect(screen.getByText(/勝ち/)).toBeInTheDocument();
      expect(screen.getByText(/1-0/)).toBeInTheDocument();
    });

    test('「次」の試合はそのまま出る', () => {
      renderLiveCard({
        live: finishedLive,
        next: {
          classLabel: '1部',
          teamA: { number: 3, players: ['山田'] },
          teamB: { number: 4, players: ['中村'] },
          isMine: false,
        },
        finishedGames: [[21, 15]],
        currentGame: [0, 0],
        finished: true,
      });

      expect(screen.getByText('次')).toBeInTheDocument();
      expect(screen.getByText('山田 vs 中村')).toBeInTheDocument();
    });
  });
});

// 押せるところの大きさ・点滅の有無・枠線の色は jsdom では測れない（クラス名を見るだけでは実際の見た目を保証できない）。
// 実際の見た目は e2e/courts.spec.ts で Playwright に確かめさせている。
