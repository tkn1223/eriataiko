import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtCard } from '@/ui/matches/court-card';
import { boardMatch } from '@/ui/matches/test-support';
import type { BoardMatch } from '@/ui/matches/types';

function makeMatch(
  overrides: Partial<BoardMatch> & Pick<BoardMatch, 'matchId' | 'orderInCourt' | 'status'>
): BoardMatch {
  return boardMatch({
    scores: overrides.status === 'done' ? [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }] : [],
    ...overrides,
  });
}

function renderCard({
  matches,
  listedMatches = matches,
  courtNumber = 1,
  isOpen = false,
  showDone = false,
  onToggleOpen = () => {},
  onToggleShowDone = () => {},
}: {
  matches: BoardMatch[];
  listedMatches?: BoardMatch[];
  courtNumber?: number | null;
  isOpen?: boolean;
  showDone?: boolean;
  onToggleOpen?: () => void;
  onToggleShowDone?: () => void;
}) {
  return render(
    <CourtCard
      courtNumber={courtNumber}
      allMatches={matches}
      listedMatches={listedMatches}
      isOpen={isOpen}
      showDone={showDone}
      onToggleOpen={onToggleOpen}
      onToggleShowDone={onToggleShowDone}
    />
  );
}

describe('CourtCard', () => {
  test('見出しを押すと onToggleOpen が呼ばれる', () => {
    const onToggleOpen = vi.fn();
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'waiting' })],
      onToggleOpen,
    });

    fireEvent.click(screen.getByRole('button', { name: /コート1/ }));
    expect(onToggleOpen).toHaveBeenCalled();
  });

  test('isOpen が false のときは中身が出ない', () => {
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'waiting' })],
      isOpen: false,
    });

    expect(screen.queryByTestId('match-row-m1')).not.toBeInTheDocument();
  });

  test('isOpen が true のときは中身が出る', () => {
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'waiting' })],
      isOpen: true,
    });

    expect(screen.getByTestId('match-row-m1')).toBeInTheDocument();
  });

  test('コートが決まっていないカード（courtNumber が null）は「コート未定」と出る', () => {
    renderCard({
      courtNumber: null,
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: null, courtNumber: null, status: 'waiting' }),
      ],
    });

    expect(screen.getByRole('button', { name: /^コート未定/ })).toBeInTheDocument();
  });

  test('コート未定のカードの見出しには「現在◯試合目」を出さない（どのコートの何試合目か決まっていない）', () => {
    renderCard({
      courtNumber: null,
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 2, courtNumber: null, status: 'live' })],
    });

    expect(screen.queryByText(/現在\d+試合目/)).not.toBeInTheDocument();
    expect(screen.getByText('残り1試合')).toBeInTheDocument();
  });

  test('全部終わっているコートは見出しに「すべて終了」が出る', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'done' }),
      ],
    });
    expect(screen.getByText('すべて終了')).toBeInTheDocument();
  });

  test('終わっていない試合が残っているコートは見出しに「残り◯試合」が出る', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'live' }),
        makeMatch({ matchId: 'm3', orderInCourt: 3, status: 'waiting' }),
        makeMatch({ matchId: 'm4', orderInCourt: 4, status: 'waiting' }),
      ],
    });
    expect(screen.getByText('残り3試合')).toBeInTheDocument();
  });

  test('進行中の試合も「残り」に数える（最後の1試合が進行中でも「残り0試合」にしない）', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'live' }),
      ],
    });

    expect(screen.getByText('残り1試合')).toBeInTheDocument();
    expect(screen.queryByText('残り0試合')).not.toBeInTheDocument();
    expect(screen.queryByText('すべて終了')).not.toBeInTheDocument();
  });

  test('進行中の試合があるコートの見出しに「現在◯試合目」が出る', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'live' }),
        makeMatch({ matchId: 'm3', orderInCourt: 3, status: 'waiting' }),
      ],
    });
    expect(screen.getByText('現在2試合目')).toBeInTheDocument();
  });

  test('進行中が 2 つあるとき（終了を取り消して直している）は、順番が後のほうを「現在」にする（結果LIVE の「今の試合」と同じ）', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'live' }),
        makeMatch({ matchId: 'm3', orderInCourt: 3, status: 'live' }),
      ],
    });

    expect(screen.getByText('現在3試合目')).toBeInTheDocument();
  });

  test('進行中の試合が無いコートには「現在◯試合目」が出ない', () => {
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'waiting' })],
    });
    expect(screen.queryByText(/現在\d+試合目/)).not.toBeInTheDocument();
  });

  test('進行中の試合の順番が未定のときは「現在」を出さない（「現在null試合目」にしない）', () => {
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: null, status: 'live' })],
    });
    expect(screen.queryByText(/現在/)).not.toBeInTheDocument();
  });

  test('終わった試合は最初は隠れていて、「✓ 終了した◯試合を見る」を押すと出る', () => {
    const onToggleShowDone = vi.fn();
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'waiting' }),
      ],
      isOpen: true,
      showDone: false,
      onToggleShowDone,
    });

    expect(screen.queryByTestId('match-row-m1')).not.toBeInTheDocument();
    expect(screen.getByTestId('match-row-m2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '✓ 終了した1試合を見る' }));
    expect(onToggleShowDone).toHaveBeenCalled();
  });

  test('showDone が true のとき、終わった試合も出て「隠す」の文言になる', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'waiting' }),
      ],
      isOpen: true,
      showDone: true,
    });

    expect(screen.getByTestId('match-row-m1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✓ 終了した1試合を隠す' })).toBeInTheDocument();
  });

  test('絞り込みで並ぶ試合が減っても、見出しはコート全体の状態を出す', () => {
    const allMatches = [
      makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'done' }),
      makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'live' }),
      makeMatch({ matchId: 'm3', orderInCourt: 3, status: 'waiting' }),
    ];
    renderCard({ matches: allMatches, listedMatches: [allMatches[0]], isOpen: true });

    expect(screen.getByText('残り2試合')).toBeInTheDocument();
    expect(screen.getByText('現在2試合目')).toBeInTheDocument();
    expect(screen.queryByText('すべて終了')).not.toBeInTheDocument();
  });

  test('終わった試合が無いコートには「終了した◯試合を見る」の帯が出ない', () => {
    renderCard({
      matches: [makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'waiting' })],
      isOpen: true,
    });

    expect(screen.queryByText(/終了した/)).not.toBeInTheDocument();
  });

  test('開いた中の行は、進行中の行も含めて押せない', () => {
    renderCard({
      matches: [
        makeMatch({ matchId: 'm1', orderInCourt: 1, status: 'live' }),
        makeMatch({ matchId: 'm2', orderInCourt: 2, status: 'waiting' }),
      ],
      isOpen: true,
    });

    // 見出しのボタン 1 つだけ（行のボタンは無い）
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
