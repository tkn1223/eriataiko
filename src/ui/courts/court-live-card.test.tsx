import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtLiveCard } from '@/ui/courts/court-live-card';
import type { Court, GameScore, LiveScore } from '@/ui/courts/sample-data';

const baseLive: NonNullable<Court['live']> = {
  classLabel: '2部',
  roundLabel: '予選 1回戦',
  teamA: { number: 1, players: ['佐藤', '鈴木'] },
  teamB: { number: 2, players: ['高橋', '伊藤'] },
  isMine: false,
  scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
  maxGameCount: 1,
};

function renderLiveCard({
  live = baseLive,
  next = null,
  scores = live?.scores ?? [],
  finished = false,
  onIncrement = () => {},
  onDecrement = () => {},
  onFinishMatch = () => {},
}: {
  live?: Court['live'];
  next?: Court['next'];
  scores?: GameScore[];
  finished?: boolean;
  onIncrement?: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement?: (gameNumber: number, side: 'A' | 'B') => void;
  onFinishMatch?: () => void;
} = {}) {
  const court: Court = { courtNumber: 3, live, next };
  const liveScore: LiveScore | null = live ? { scores, finished } : null;
  return render(
    <CourtLiveCard
      court={court}
      liveScore={liveScore}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onFinishMatch={onFinishMatch}
    />
  );
}

describe('CourtLiveCard', () => {
  test('進行中のコートに「LIVE」と部・回戦が出る', () => {
    renderLiveCard();

    expect(screen.getByText('コート3')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
    expect(screen.getByText('予選 1回戦')).toBeInTheDocument();
  });

  test('両ペアの名前が出る', () => {
    renderLiveCard();

    expect(screen.getByText('佐藤・鈴木')).toBeInTheDocument();
    expect(screen.getByText('高橋・伊藤')).toBeInTheDocument();
  });

  test('上限ゲーム数ぶんの枠が「第Nゲーム」として並ぶ', () => {
    renderLiveCard({
      live: { ...baseLive, maxGameCount: 3 },
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
    });

    expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
    expect(screen.getByText('第2ゲーム')).toBeInTheDocument();
    expect(screen.getByText('第3ゲーム')).toBeInTheDocument();
  });

  test('点が入っていない枠は0対0で出る', () => {
    renderLiveCard({
      live: { ...baseLive, maxGameCount: 2 },
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
    });

    // 第2ゲームはまだ枠に点が無いので0対0
    expect(screen.getAllByText('0', { exact: true })).toHaveLength(2);
  });

  test('どの枠にも「−」「＋」が出て、押せる', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    renderLiveCard({
      live: { ...baseLive, maxGameCount: 2 },
      scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
      onIncrement,
      onDecrement,
    });

    fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の第1ゲームの得点を1増やす' }));
    expect(onIncrement).toHaveBeenCalledWith(1, 'A');

    fireEvent.click(screen.getByRole('button', { name: '高橋・伊藤の第1ゲームの得点を1減らす' }));
    expect(onDecrement).toHaveBeenCalledWith(1, 'B');

    // まだ点の入っていない第2ゲームの枠も押せる
    fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の第2ゲームの得点を1増やす' }));
    expect(onIncrement).toHaveBeenCalledWith(2, 'A');
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

  describe('「試合を終了する」を押したとき', () => {
    test('0対0で押すと「まだ点が入っていません」と出て、確認画面は出ない', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByRole('status')).toHaveTextContent('まだ点が入っていません');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('同点（勝ちゲーム数が同数）で押すと「同点では終了できません」と出て、確認画面は出ない', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
          { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
        ],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByRole('status')).toHaveTextContent('同点では終了できません');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('勝ちゲーム数に差が付いていれば確認画面が出て、まだ画面は変わらない', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
      // まだ確定していないので、カードの得点はそのまま
      expect(screen.getByText('21', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('19', { exact: true })).toBeInTheDocument();
    });

    test('確認画面に、各ゲームの得点と勝ったペアが出る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByText('21 - 19', { exact: false })).toBeInTheDocument();
      expect(screen.getByText(/勝ち: 佐藤・鈴木/)).toBeInTheDocument();
    });

    test('確認画面に試合の勝ちペアとスコアが出る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
          { gameNumber: 2, sideAScore: 21, sideBScore: 15 },
        ],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
      expect(screen.getByText(/2-0/)).toBeInTheDocument();
    });

    test('決勝（上限3ゲーム）を1ゲームだけで終了しても、確認画面に試合の勝ちペアが出る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));

      expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
      expect(screen.getByText(/1-0/)).toBeInTheDocument();
    });

    test('「戻る」を押すと何も変わらずに閉じる', () => {
      const onFinishMatch = vi.fn();
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
        onFinishMatch,
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));
      fireEvent.click(screen.getByRole('button', { name: '戻る' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onFinishMatch).not.toHaveBeenCalled();
    });

    test('「OK」を押すと onFinishMatch が呼ばれる', () => {
      const onFinishMatch = vi.fn();
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
        onFinishMatch,
      });

      fireEvent.click(screen.getByRole('button', { name: '試合を終了する' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onFinishMatch).toHaveBeenCalled();
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
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
        finished: true,
      });
    }

    test('右の「LIVE」が「終了」になる', () => {
      renderFinished();

      expect(screen.getByText('終了')).toBeInTheDocument();
      expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    });

    test('「−」「＋」「試合を終了する」が消える', () => {
      renderFinished();

      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '試合を終了する' })).not.toBeInTheDocument();
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

    test('決勝（上限3ゲーム）を1ゲームだけで終了しても「勝ち: 佐藤・鈴木（1-0）」が残る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
        finished: true,
      });

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
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
        finished: true,
      });

      expect(screen.getByText('次')).toBeInTheDocument();
      expect(screen.getByText('山田 vs 中村')).toBeInTheDocument();
    });
  });
});

// 押せるところの大きさ・点滅の有無・枠線の色は jsdom では測れない（クラス名を見るだけでは実際の見た目を保証できない）。
// 実際の見た目は e2e/courts.spec.ts で Playwright に確かめさせている。
