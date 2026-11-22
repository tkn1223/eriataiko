import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtCard } from '@/ui/matches/court-card';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 1a のコートのカード。開閉は無く、いまの試合（2 段＋点）・進み具合の線・次の試合が最初から見える。
 * 押すとそのコートの全試合（1b）へ。
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

function court1(extra: Partial<Parameters<typeof boardMatch>[0]>[] = []) {
  return [
    boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
    boardMatch({
      matchId: 'b',
      orderInCourt: 2,
      status: 'live',
      teamA: aoizora,
      teamB: umikaze,
      scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
    }),
    boardMatch({ matchId: 'c', orderInCourt: 3, status: 'waiting', teamA: morino, teamB: sakura }),
    ...extra.map((overrides, index) =>
      boardMatch({ matchId: `x${index}`, orderInCourt: 4 + index, status: 'waiting', ...overrides })
    ),
  ];
}

function renderCard(matches = court1(), onOpen = vi.fn()) {
  render(<CourtCard courtNumber={1} matches={matches} onOpen={onOpen} />);
  return { onOpen };
}

describe('CourtCard', () => {
  test('開かなくても、いまの試合の両方の名前・点と、次の試合が見える', () => {
    renderCard();

    const card = screen.getByTestId('matches-court-card-1');
    expect(within(card).getByText('ハルキ・ミドリ')).toBeInTheDocument();
    expect(within(card).getByText('トモ・リコ')).toBeInTheDocument();
    expect(within(card).getByText('12')).toBeInTheDocument();
    expect(within(card).getByText('9')).toBeInTheDocument();
    expect(within(card).getByText('第1ゲーム')).toBeInTheDocument();
    expect(within(card).getByText('次')).toBeInTheDocument();
    expect(within(card).getByText('ケイ・ユイ vs シン・ヒナ')).toBeInTheDocument();
  });

  test('コート名・部・状態の札・進み具合（終わった数/全部）が出る', () => {
    renderCard();

    const card = screen.getByTestId('matches-court-card-1');
    expect(within(card).getByText('コート1')).toBeInTheDocument();
    expect(within(card).getByText('1部')).toBeInTheDocument();
    expect(within(screen.getByTestId('court-status'))).toBeDefined();
    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
    expect(within(card).getByText('1/3')).toBeInTheDocument();
    expect(within(card).getByText(/全3試合/)).toBeInTheDocument();
  });

  test('カードを押すと onOpen にコート番号が渡る（そのコートの全試合を開く）', () => {
    const { onOpen } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: /コート1/ }));

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  test('2 ゲーム目以降は「第2ゲーム ・ 第1G 21-18」と、終わったゲームの点が出る', () => {
    renderCard([
      boardMatch({
        matchId: 'b',
        orderInCourt: 1,
        status: 'live',
        maxGameCount: 3,
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 18 },
          { gameNumber: 2, sideAScore: 17, sideBScore: 20 },
        ],
      }),
    ]);

    expect(screen.getByText('第2ゲーム ・ 第1G 21-18')).toBeInTheDocument();
  });

  test('呼出待ちのコートは、点の代わりに「–」と「呼び出し中」が出る', () => {
    renderCard([
      boardMatch({
        matchId: 'b',
        orderInCourt: 1,
        status: 'waiting',
        teamA: aoizora,
        teamB: umikaze,
      }),
      boardMatch({
        matchId: 'c',
        orderInCourt: 2,
        status: 'waiting',
        teamA: morino,
        teamB: sakura,
      }),
    ]);

    expect(screen.getByTestId('court-status')).toHaveTextContent('呼出待ち');
    expect(screen.getAllByText('–')).toHaveLength(2);
    expect(screen.getByText('呼び出し中')).toBeInTheDocument();
  });

  test('全部終わったコートは「このコートの試合は終わりました」と「結果を見る」', () => {
    renderCard([
      boardMatch({ matchId: 'a', orderInCourt: 1, status: 'done' }),
      boardMatch({ matchId: 'b', orderInCourt: 2, status: 'done' }),
    ]);

    expect(screen.getByTestId('court-status')).toHaveTextContent('全試合終了');
    expect(screen.getByText('このコートの試合は終わりました')).toBeInTheDocument();
    expect(screen.getByText(/結果を見る/)).toBeInTheDocument();
  });

  test('自分の出番（これからの試合）があるコートの線に「▲あなた」が出る。無いコートには出ない', () => {
    const { unmount } = render(
      <CourtCard
        courtNumber={1}
        matches={court1([{ isMine: true, mySide: 'A' }])}
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText('▲あなた')).toBeInTheDocument();
    unmount();

    render(<CourtCard courtNumber={2} matches={court1()} onOpen={vi.fn()} />);
    expect(screen.queryByText('▲あなた')).not.toBeInTheDocument();
  });

  test('自分が試合中のコートのカードは金の枠になり、自分の側の名前に金の点が付く', () => {
    renderCard([
      boardMatch({
        matchId: 'b',
        orderInCourt: 1,
        status: 'live',
        isMine: true,
        mySide: 'B',
        teamA: aoizora,
        teamB: umikaze,
      }),
    ]);

    expect(screen.getByTestId('matches-court-card-1').className).toMatch(/court-card-mine/);
    expect(screen.getAllByRole('img', { name: 'あなた' })).toHaveLength(1);
  });

  test('カードは scroll できるよう id を持つ（コート札で飛ぶ先）', () => {
    renderCard();

    expect(document.getElementById('matches-court-1')).toBe(
      screen.getByTestId('matches-court-card-1')
    );
  });

  test('カードの押す部分は 44px 以上の高さ', () => {
    renderCard();

    expect(screen.getByRole('button', { name: /コート1/ }).className).toMatch(/min-h-11/);
  });
});
