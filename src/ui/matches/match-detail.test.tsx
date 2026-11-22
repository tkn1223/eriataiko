import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MatchDetail } from '@/ui/matches/match-detail';
import { boardMatch } from '@/ui/matches/test-support';
import type { BoardMatch } from '@/ui/matches/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/ui/courts/use-live-updates', () => ({ useLiveUpdates: () => 'live' }));

/**
 * 試合の詳しい画面（1d 試合中・これから／1e 終了／2c 訂正のあと）。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const aoizora = {
  teamNumber: 1,
  teamName: 'あおぞら',
  players: ['ハルキ', 'ミドリ'],
  slotLabel: null,
};
const umikaze = { teamNumber: 4, teamName: 'うみかぜ', players: ['トモ', 'リコ'], slotLabel: null };
const morino = { teamNumber: 2, teamName: 'もりの', players: ['ケイ', 'ユイ'], slotLabel: null };
const sakura = { teamNumber: 3, teamName: 'さくら', players: ['シン', 'ヒナ'], slotLabel: null };

const board: BoardMatch[] = [
  boardMatch({
    matchId: 'm-1',
    orderInCourt: 1,
    status: 'done',
    teamA: aoizora,
    teamB: morino,
    scores: [
      { gameNumber: 1, sideAScore: 21, sideBScore: 18 },
      { gameNumber: 2, sideAScore: 21, sideBScore: 15 },
    ],
  }),
  boardMatch({
    matchId: 'm-2',
    orderInCourt: 2,
    status: 'done',
    ending: 'retired_side_b',
    maxGameCount: 3,
    scorerParticipantId: 'part-kei',
    teamA: aoizora,
    teamB: sakura,
    scores: [
      { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
      { gameNumber: 2, sideAScore: 8, sideBScore: 3 },
    ],
  }),
  boardMatch({
    matchId: 'm-3',
    orderInCourt: 3,
    status: 'live',
    maxGameCount: 3,
    teamA: aoizora,
    teamB: umikaze,
    scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
  }),
  boardMatch({ matchId: 'm-4', orderInCourt: 4, status: 'waiting', teamA: morino, teamB: sakura }),
];

function renderDetail(
  matchId: string,
  props: Partial<React.ComponentProps<typeof MatchDetail>> = {}
) {
  return render(
    <MatchDetail
      board={board}
      matchId={matchId}
      scorerNames={{ 'part-kei': 'ケイ（もりの）' }}
      canCorrect={false}
      corrected={null}
      stageLabel="予選リーグ"
      completedMatches={2}
      totalMatches={72}
      {...props}
    />
  );
}

describe('1d 試合中の詳しい画面', () => {
  test('試合速報と同じ得点板（チーム名・選手名・点）が出る', () => {
    renderDetail('m-3');

    const panelA = screen.getByTestId('team-panel-A');
    expect(within(panelA).getByText('あおぞら')).toBeInTheDocument();
    expect(within(panelA).getByText('ハルキ')).toBeInTheDocument();
    expect(within(panelA).getByText('ミドリ')).toBeInTheDocument();
    expect(within(panelA).getByText('12')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-panel-B')).getByText('9')).toBeInTheDocument();
    expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
  });

  test('［コートNの試合速報を開く］が出て、押すと試合速報のそのコート（/courts#court-N）へ移る', () => {
    renderDetail('m-3');

    expect(screen.getByRole('link', { name: 'コート1の試合速報を開く' })).toHaveAttribute(
      'href',
      '/courts#court-1'
    );
  });

  test('見出し・状態の札・部と回戦とゲーム制の札が出る', () => {
    renderDetail('m-3');

    expect(screen.getByRole('heading', { name: 'コート1 ・ 3試合目' })).toBeInTheDocument();
    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByText('3ゲーム制')).toBeInTheDocument();
  });

  test('そのコートの前の試合（結果）と次の試合が 1 行ずつ出て、押すとその試合へ移る', () => {
    renderDetail('m-3');

    const prev = screen.getByRole('link', { name: /前 2/ });
    expect(prev).toHaveAttribute('href', '/matches/m-2');
    expect(prev).toHaveTextContent('ハルキ・ミドリ vs シン・ヒナ');
    expect(prev).toHaveTextContent('2-0');
    expect(prev).toHaveTextContent('棄権');
    const next = screen.getByRole('link', { name: /次 4/ });
    expect(next).toHaveAttribute('href', '/matches/m-4');
    expect(next).toHaveTextContent('ケイ・ユイ vs シン・ヒナ');
  });

  test('これからの試合にも得点板（0 対 0）と速報への入り口が出る。訂正のボタンは出ない', () => {
    renderDetail('m-4', { canCorrect: true });

    expect(within(screen.getByTestId('team-panel-A')).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'コート1の試合速報を開く' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /得点を訂正する/ })).not.toBeInTheDocument();
  });

  test('「‹ コート1」で、そのコートの全試合へ戻れる', () => {
    renderDetail('m-3');

    expect(screen.getByRole('link', { name: 'コート1' })).toHaveAttribute(
      'href',
      '/matches?court=1'
    );
  });

  test('自分の試合のカードは金の枠', () => {
    const mine = board.map((match) =>
      match.matchId === 'm-3' ? { ...match, isMine: true } : match
    );
    renderDetail('m-3', { board: mine });

    expect(screen.getByTestId('match-detail-card').className).toMatch(/court-card-mine/);
  });
});

describe('1e 終わった試合の詳しい画面', () => {
  test('ゲームごとの点の表・ゲーム数・勝の札・棄権の札・棄権の文が出る', () => {
    renderDetail('m-2');

    const table = screen.getByTestId('result-table');
    expect(within(table).getByText('第1G')).toBeInTheDocument();
    expect(within(table).getByText('第2G')).toBeInTheDocument();
    expect(within(table).getByText('ゲーム')).toBeInTheDocument();
    expect(within(table).getByTestId('result-row-A')).toHaveTextContent('21');
    expect(within(table).getByTestId('result-row-A')).toHaveTextContent('勝');
    expect(within(table).getByTestId('result-row-B')).toHaveTextContent('棄権');
    expect(within(table).getByTestId('result-row-B')).not.toHaveTextContent('勝');
    expect(screen.getByText('第2ゲームの途中で シン・ヒナ 棄権')).toBeInTheDocument();
    expect(screen.getByTestId('court-status')).toHaveTextContent('終了');
  });

  test('入力担当の名前（チーム）が出る。いなければ行ごと出ない', () => {
    const { unmount } = renderDetail('m-2');
    expect(screen.getByText('入力担当：ケイ（もりの）')).toBeInTheDocument();
    unmount();

    renderDetail('m-1');
    expect(screen.queryByText(/入力担当/)).not.toBeInTheDocument();
  });

  test('参加者の名前が引けない担当は、行ごと出さない（ほかの人と偽らない）', () => {
    renderDetail('m-2', { scorerNames: {} });

    expect(screen.queryByText(/入力担当/)).not.toBeInTheDocument();
  });

  test('［得点を訂正する］は選手が終わった試合を見たときだけ出て、押すと直す画面へ移る', () => {
    renderDetail('m-2', { canCorrect: true });

    expect(screen.getByRole('link', { name: /得点を訂正する/ })).toHaveAttribute(
      'href',
      '/matches/m-2/correct'
    );
  });

  test('観戦者（canCorrect なし）には［得点を訂正する］が出ない', () => {
    renderDetail('m-2', { canCorrect: false });

    expect(screen.queryByRole('link', { name: /得点を訂正する/ })).not.toBeInTheDocument();
  });

  test('試合中・これからの試合には［得点を訂正する］が出ない（選手でも）', () => {
    const { unmount } = renderDetail('m-3', { canCorrect: true });
    expect(screen.queryByRole('link', { name: /得点を訂正する/ })).not.toBeInTheDocument();
    unmount();

    renderDetail('m-4', { canCorrect: true });
    expect(screen.queryByRole('link', { name: /得点を訂正する/ })).not.toBeInTheDocument();
  });

  test('［星取表で見る ›］が出る', () => {
    renderDetail('m-2');

    expect(screen.getByRole('link', { name: /星取表で見る/ })).toHaveAttribute('href', '/bracket');
  });

  test('押すところは 44px 以上の高さ', () => {
    renderDetail('m-2', { canCorrect: true });

    expect(screen.getByRole('link', { name: /得点を訂正する/ }).className).toMatch(
      /min-h-\[46px\]/
    );
    expect(screen.getByRole('link', { name: /星取表で見る/ }).className).toMatch(/min-h-\[46px\]/);
  });
});

describe('2c 訂正のあと', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('上に緑の帯「訂正しました」が出る。出ていないときは出ない', () => {
    const { unmount } = renderDetail('m-2', { corrected: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('訂正しました');
    expect(screen.getByRole('status')).toHaveTextContent('星取表・順位も更新済み');
    unmount();

    renderDetail('m-2');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('直したゲームの点は金の地になり、数秒たつと消える', () => {
    renderDetail('m-2', { corrected: 2 });

    const cells = screen.getAllByTestId('result-cell-game-2');
    expect(cells.length).toBe(2);
    for (const cell of cells) expect(cell.className).toMatch(/bg-gold-soft/);
    expect(screen.getAllByTestId('result-cell-game-1')[0].className).not.toMatch(/bg-gold-soft/);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    for (const cell of screen.getAllByTestId('result-cell-game-2')) {
      expect(cell.className).not.toMatch(/bg-gold-soft/);
    }
  });
});

describe('見つからないとき', () => {
  test('一覧に無い試合なら、日本語の案内が出る', () => {
    renderDetail('no-such-match');

    expect(screen.getByText('その試合は見つかりませんでした')).toBeInTheDocument();
  });
});
