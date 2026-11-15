import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CourtLiveCard, type FixActions, type ScorerControl } from '@/ui/courts/court-live-card';
import { useFinishSheets } from '@/ui/courts/use-finish-sheets';
import type {
  Court,
  CourtTeam,
  GameScore,
  LiveScore,
  PreviousMatch,
  ScoreSyncStatus,
} from '@/ui/courts/types';

/**
 * 結果LIVE のカードの作り直し（得点板の形）の受け入れ基準。
 * 仕様: docs/specs/2026-11-15-courts-redesign.md
 * 動き（担当・終了確認・送り直しなど）は court-live-card.test.tsx が見ているので、ここは「何を出すか・出さないか」。
 */

function team(overrides: Partial<CourtTeam> = {}): CourtTeam {
  return {
    teamNumber: 1,
    teamName: '愛知南',
    players: ['たろう', 'いとう'],
    slotLabel: null,
    ...overrides,
  };
}

const live: NonNullable<Court['live']> = {
  matchId: 'match-live-1',
  classLabel: { name: '2部', colorNumber: 2 },
  roundLabel: '予選 1回戦',
  teamA: team({ teamNumber: 1, teamName: '愛知南', players: ['たろう', 'いとう'] }),
  teamB: team({ teamNumber: 2, teamName: '愛知中央', players: ['やまもと', 'まつもと'] }),
  isMine: false,
  scores: [{ gameNumber: 1, sideAScore: 14, sideBScore: 11 }],
  maxGameCount: 1,
};

const next: NonNullable<Court['next']> = {
  matchId: 'match-next-1',
  classLabel: { name: '3部', colorNumber: 3 },
  roundLabel: '予選 2回戦',
  teamA: team({ teamNumber: 3, teamName: '愛知北', players: ['ゆうき'] }),
  teamB: team({ teamNumber: 4, teamName: '愛知西', players: ['みき'] }),
  isMine: false,
  maxGameCount: 1,
};

const previous: PreviousMatch = {
  matchId: 'match-prev-1',
  classLabel: { name: '2部', colorNumber: 2 },
  roundLabel: '予選 0回戦',
  teamA: team({ teamNumber: 3, teamName: '愛知北', players: ['ひろ'] }),
  teamB: team({ teamNumber: 4, teamName: '愛知西', players: ['けん'] }),
  isMine: false,
  scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
  maxGameCount: 1,
  ending: 'normal',
};

function scorerControl(
  view: ScorerControl['view'] = { kind: 'mine' },
  overrides: Partial<ScorerControl> = {}
): ScorerControl {
  return {
    view,
    recordedScorerIsMe: false,
    onClaim: () => {},
    onTakeOver: () => {},
    onRelease: () => {},
    onDismissRejection: () => {},
    ...overrides,
  };
}

const fixActions: Omit<FixActions, 'finishSheetOf'> = {
  syncStatusOf: () => null,
  reopenStateOf: () => null,
  onIncrement: () => {},
  onDecrement: () => {},
  onFinishMatch: () => {},
  onReopen: () => {},
};

function renderCard({
  court,
  canInput = true,
  scorer = scorerControl(),
  previousScorer,
  scores,
  syncStatus = null,
  onIncrement = () => {},
}: {
  court: Partial<Court>;
  canInput?: boolean;
  scorer?: ScorerControl;
  /** 1 つ前の試合の担当の見え方（渡さなければ scorer と同じ）。 */
  previousScorer?: ScorerControl;
  scores?: GameScore[];
  syncStatus?: ScoreSyncStatus | null;
  onIncrement?: (gameNumber: number, side: 'A' | 'B') => void;
}) {
  const fullCourt: Court = {
    courtNumber: 1,
    live: null,
    next: null,
    fixing: [],
    previous: null,
    ...court,
  };
  const active = fullCourt.live;
  const liveScore: LiveScore | null = active
    ? { scores: scores ?? active.scores, finished: false, started: true }
    : null;
  function Harness() {
    const { finishSheetOf } = useFinishSheets(null);
    return (
      <CourtLiveCard
        court={fullCourt}
        liveScore={liveScore}
        canInput={canInput}
        syncStatus={syncStatus}
        onIncrement={onIncrement}
        onDecrement={() => {}}
        onFinishMatch={() => {}}
        finishSheetOf={finishSheetOf}
        scorerOf={(matchId) =>
          matchId === previous.matchId && previousScorer ? previousScorer : scorer
        }
        fix={{ ...fixActions, finishSheetOf }}
      />
    );
  }
  return render(<Harness />);
}

describe('得点板のカード', () => {
  test('進行中のカードに、チーム名・選手名・点数が左右 2 枚の枠で出る', () => {
    renderCard({ court: { live } });

    const left = screen.getByTestId('team-panel-A');
    const right = screen.getByTestId('team-panel-B');
    expect(within(left).getByText('愛知南')).toBeInTheDocument();
    expect(within(left).getByText('たろう')).toBeInTheDocument();
    expect(within(left).getByText('いとう')).toBeInTheDocument();
    expect(within(left).getByText('14')).toBeInTheDocument();
    expect(within(right).getByText('愛知中央')).toBeInTheDocument();
    expect(within(right).getByText('やまもと')).toBeInTheDocument();
    expect(within(right).getByText('11')).toBeInTheDocument();
  });

  test('枠の色は、そのチームの色（class-labels.ts の色）になっている', () => {
    renderCard({ court: { live } });

    expect(screen.getByTestId('team-panel-A').className).toContain('border-team-1');
    expect(screen.getByTestId('team-panel-B').className).toContain('border-team-2');
  });

  test('点数は、自分の試合では大きく（48px）、ほかの試合では 38px', () => {
    const { unmount } = renderCard({ court: { live: { ...live, isMine: true } } });
    expect(within(screen.getByTestId('team-panel-A')).getByText('14')).toHaveClass('text-[48px]');
    unmount();

    renderCard({ court: { live } });
    expect(within(screen.getByTestId('team-panel-A')).getByText('14')).toHaveClass('text-[38px]');
  });

  test('「コートN」と部の札が 1 行目に出て、「LIVE」の点滅は出ない', () => {
    renderCard({ court: { courtNumber: 4, live } });

    expect(screen.getByText('コート4')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  test('カードの右上に状態の札が出る（進行中は「試合中」）', () => {
    renderCard({ court: { live } });

    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
  });

  test('呼出待ちのコートは、次の試合を 0 対 0 で出し、札は「呼出待ち」になる（選手にも観戦者にも同じ形）', () => {
    for (const canInput of [true, false]) {
      const { unmount } = renderCard({ court: { next }, canInput });

      expect(screen.getByTestId('court-status')).toHaveTextContent('呼出待ち');
      expect(within(screen.getByTestId('team-panel-A')).getByText('愛知北')).toBeInTheDocument();
      expect(within(screen.getByTestId('team-panel-A')).getByText('0')).toBeInTheDocument();
      expect(within(screen.getByTestId('team-panel-B')).getByText('0')).toBeInTheDocument();
      unmount();
    }
  });

  test('チームが決まっていない側は、灰色の枠に「予選1位」などの空枠ラベルが出る', () => {
    const withSlot = {
      ...live,
      teamB: team({ teamNumber: null, teamName: null, players: [], slotLabel: '予選1位' }),
    };
    renderCard({ court: { live: withSlot } });

    const empty = screen.getByTestId('team-panel-B');
    expect(within(empty).getByText('予選1位')).toBeInTheDocument();
    expect(empty.className).toContain('gray');
  });

  test('1 ゲーム制のカードには「第1ゲーム」が出て、終わったゲームの札は出ない', () => {
    renderCard({ court: { live } });

    expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
    expect(screen.queryByText(/第\dG：/)).not.toBeInTheDocument();
  });

  describe('第2ゲーム以降', () => {
    const final = {
      ...live,
      maxGameCount: 3,
      scores: [
        { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
        { gameNumber: 2, sideAScore: 14, sideBScore: 11 },
      ],
    };

    test('「第2ゲーム」と、終わったゲームの「第1G：21-15」が出る', () => {
      renderCard({ court: { live: final } });

      expect(screen.getByText('第2ゲーム')).toBeInTheDocument();
      expect(screen.getByText('第1G：21-15')).toBeInTheDocument();
      // 枠に出ているのは、いま入れている第2ゲームの点
      expect(within(screen.getByTestId('team-panel-A')).getByText('14')).toBeInTheDocument();
    });

    test('第1ゲームのあいだは、札は出ない', () => {
      renderCard({
        court: { live: { ...final, scores: [{ gameNumber: 1, sideAScore: 3, sideBScore: 2 }] } },
      });

      expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
      expect(screen.queryByText(/第\dG：/)).not.toBeInTheDocument();
    });
  });

  test('自分の試合のカードは枠が太い金色で囲まれ、「あなたの試合」の文字は出ない', () => {
    renderCard({ court: { live: { ...live, isMine: true } } });

    expect(screen.getByTestId('court-card-1')).toHaveClass('border-gold');
    expect(screen.queryByText('あなたの試合')).not.toBeInTheDocument();
  });

  test('自分の試合でないカードは、金の枠にならない', () => {
    renderCard({ court: { live } });

    expect(screen.getByTestId('court-card-1')).not.toHaveClass('border-gold');
  });

  test('進行中のカードに「次」の行は出ない', () => {
    renderCard({ court: { live, next } });

    expect(screen.queryByText('次')).not.toBeInTheDocument();
    expect(screen.queryByText('ゆうき')).not.toBeInTheDocument();
  });
});

describe('担当の欄', () => {
  test('担当がいない試合で、選手には赤い点線の［入力を担当する］と「入力担当がまだいません」が出る', () => {
    const onClaim = vi.fn();
    renderCard({ court: { live }, scorer: scorerControl({ kind: 'vacant' }, { onClaim }) });

    const claim = screen.getByRole('button', { name: '入力を担当する' });
    expect(claim.className).toContain('border-dashed');
    expect(claim.className).toContain('border-live');
    expect(within(claim).getByText('入力担当がまだいません')).toBeInTheDocument();
    fireEvent.click(claim);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  test('担当がいない試合でも、観戦者には何も出ない', () => {
    renderCard({ court: { live }, canInput: false, scorer: scorerControl({ kind: 'vacant' }) });

    expect(screen.queryByRole('button', { name: '入力を担当する' })).not.toBeInTheDocument();
    expect(screen.queryByText('入力担当がまだいません')).not.toBeInTheDocument();
    expect(screen.queryByText(/入力する人がいません/)).not.toBeInTheDocument();
  });

  test('自分が担当の試合で、各チームの枠の下に［−］［＋］が出て、4 つとも同じ大きさの作りになる', () => {
    const onIncrement = vi.fn();
    renderCard({ court: { live }, onIncrement });

    const buttons = [
      screen.getByRole('button', { name: 'たろう・いとうの第1ゲームの得点を1減らす' }),
      screen.getByRole('button', { name: 'たろう・いとうの第1ゲームの得点を1増やす' }),
      screen.getByRole('button', { name: 'やまもと・まつもとの第1ゲームの得点を1減らす' }),
      screen.getByRole('button', { name: 'やまもと・まつもとの第1ゲームの得点を1増やす' }),
    ];
    // 同じ大きさの寸法クラス（実際の大きさは e2e で測る）
    const sizeClasses = (button: HTMLElement) =>
      button.className.split(' ').filter((name) => /^(min-h|h|w|min-w|flex)-/.test(name));
    for (const button of buttons) expect(sizeClasses(button)).toEqual(sizeClasses(buttons[0]));
    // ＋は黒地に白、−は白地
    expect(buttons[1].className).toContain('bg-btn-dark');
    expect(buttons[0].className).not.toContain('bg-btn-dark');

    fireEvent.click(buttons[1]);
    expect(onIncrement).toHaveBeenCalledWith(1, 'A');
  });

  test('自分が担当のとき、［−］［＋］の下に［試合終了］と［担当をやめる］が出る', () => {
    renderCard({ court: { live } });

    expect(screen.getByRole('button', { name: '試合終了' }).className).toContain('bg-btn-dark');
    expect(screen.getByRole('button', { name: '担当をやめる' })).toBeInTheDocument();
  });

  test('ほかの人が担当の試合で、選手には担当の名前（チーム名つき）と［入力を引き継ぐ］が出る', () => {
    renderCard({
      court: { live },
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }),
    });

    expect(screen.getByText('愛知北のじろうさん')).toBeInTheDocument();
    expect(screen.getByText('が入力しています')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '入力を引き継ぐ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
  });

  test('ほかの人が担当の試合でも、観戦者には名前も［入力を引き継ぐ］も出ない', () => {
    renderCard({
      court: { live },
      canInput: false,
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }),
    });

    expect(screen.queryByText(/じろう/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を引き継ぐ' })).not.toBeInTheDocument();
  });
});

describe('1つ前の［訂正］を出す相手', () => {
  test('その試合に出た選手には、1 行の「1つ前　愛知北 21-15 愛知西　［訂正］」が出る', () => {
    renderCard({
      court: { live, previous: { ...previous, isMine: true } },
      scorer: scorerControl({ kind: 'vacant' }),
    });

    const row = screen.getByTestId('previous-match-1');
    expect(within(row).getByText('1つ前の試合')).toBeInTheDocument();
    expect(row).toHaveTextContent('愛知北 21-15 愛知西');
    expect(within(row).getByRole('button', { name: '訂正' })).toBeInTheDocument();
  });

  test('複数ゲーム制の 1つ前は、点数ではなく取ったゲーム数を出す', () => {
    renderCard({
      court: {
        live,
        previous: {
          ...previous,
          isMine: true,
          maxGameCount: 3,
          scores: [
            { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
            { gameNumber: 2, sideAScore: 18, sideBScore: 21 },
            { gameNumber: 3, sideAScore: 21, sideBScore: 19 },
          ],
        },
      },
      scorer: scorerControl({ kind: 'vacant' }),
    });

    expect(screen.getByTestId('previous-match-1')).toHaveTextContent('愛知北 2-1 愛知西');
  });

  test('いまそのコートの試合の担当（自分）には、出ていなくても出る', () => {
    renderCard({ court: { live, previous }, scorer: scorerControl({ kind: 'mine' }) });

    expect(
      within(screen.getByTestId('previous-match-1')).getByRole('button', { name: '訂正' })
    ).toBeInTheDocument();
  });

  test('進行中が無く呼出待ちの次の試合があるコートでは、その次の試合の担当（自分）に出る', () => {
    // 前の試合が終わった直後は、次の試合が「呼出待ち」のまま担当を取る。その人が
    // いまのコートの担当なので、1つ前の押し間違いを直せるようにしておく
    renderCard({ court: { next, previous }, scorer: scorerControl({ kind: 'mine' }) });

    expect(
      within(screen.getByTestId('previous-match-1')).getByRole('button', { name: '訂正' })
    ).toBeInTheDocument();
  });

  test('出ていない選手で、担当でもない人には出ない', () => {
    for (const view of [{ kind: 'vacant' }, { kind: 'other', name: '愛知北のじろう' }] as const) {
      const { unmount } = renderCard({ court: { live, previous }, scorer: scorerControl(view) });

      expect(screen.queryByTestId('previous-match-1')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '訂正' })).not.toBeInTheDocument();
      unmount();
    }
  });

  test('その 1 つ前の試合で入力担当だった人（出てもいない・いまの担当でもない）には出る', () => {
    renderCard({
      court: { live, previous },
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }),
      previousScorer: scorerControl({ kind: 'vacant' }, { recordedScorerIsMe: true }),
    });

    expect(
      within(screen.getByTestId('previous-match-1')).getByRole('button', { name: '訂正' })
    ).toBeInTheDocument();
  });

  test('進行中のコートで、その 1つ前の試合に出ていない選手（知らせも無く、いまの担当でも前の担当でもない）には、［訂正］も 1つ前の行も出ない', () => {
    renderCard({
      court: { live, previous: { ...previous, isMine: false } },
      canInput: true,
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }),
      previousScorer: scorerControl({ kind: 'vacant' }, { recordedScorerIsMe: false }),
    });

    expect(screen.queryByRole('button', { name: '訂正' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('previous-match-1')).not.toBeInTheDocument();
  });

  test('観戦者には出ない', () => {
    renderCard({ court: { live, previous: { ...previous, isMine: true } }, canInput: false });

    expect(screen.queryByTestId('previous-match-1')).not.toBeInTheDocument();
  });
});

describe('1つ前の知らせ', () => {
  test('出す相手でない選手でも、その試合の保存の知らせが残っていれば、行も［訂正］も出す', () => {
    function Harness() {
      const { finishSheetOf } = useFinishSheets(null);
      return (
        <CourtLiveCard
          court={{ courtNumber: 1, live, next: null, fixing: [], previous }}
          liveScore={{ scores: live.scores, finished: false, started: true }}
          canInput
          syncStatus={null}
          onIncrement={() => {}}
          onDecrement={() => {}}
          onFinishMatch={() => {}}
          finishSheetOf={finishSheetOf}
          scorerOf={() => scorerControl({ kind: 'other', name: '愛知北のじろう' })}
          fix={{
            ...fixActions,
            finishSheetOf,
            syncStatusOf: (matchId) =>
              matchId === previous.matchId
                ? {
                    retryingMessage: null,
                    rejectedMessage: '終了した試合です。',
                    finishing: false,
                    finishRetrying: false,
                    finishRejectedMessage: null,
                  }
                : null,
          }}
        />
      );
    }
    render(<Harness />);

    const row = screen.getByTestId('previous-match-1');
    expect(within(row).getByRole('status')).toHaveTextContent('終了した試合です。');
    expect(within(row).getByRole('button', { name: '訂正' })).toBeInTheDocument();
  });
});

describe('試合が全部終わったコート', () => {
  test('1つ前を出せる人には、カードを残して 1つ前の行を出す', () => {
    renderCard({ court: { previous: { ...previous, isMine: true } } });

    expect(screen.getByTestId('court-card-1')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('previous-match-1')).getByRole('button', { name: '訂正' })
    ).toBeInTheDocument();
    expect(screen.queryByText('このコートの試合は終わりました')).not.toBeInTheDocument();
  });

  test('1つ前を出せない人（観戦者・出ていない選手）には「このコートの試合は終わりました」が出る', () => {
    for (const canInput of [true, false]) {
      const { unmount } = renderCard({ court: { previous }, canInput });

      expect(screen.getByText('このコートの試合は終わりました')).toBeInTheDocument();
      expect(screen.queryByTestId('previous-match-1')).not.toBeInTheDocument();
      unmount();
    }
  });
});
