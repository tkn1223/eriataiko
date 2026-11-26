import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { hasAnyPoint } from '@/domain/scoring';
import { type ComponentProps } from 'react';
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

/** 終わったゲームの札（「第1G：」と太い数字が別の要素なので、札全体の文字で探す）。 */
const chip = (text: string) => (_content: string, element: Element | null) =>
  element?.tagName === 'LI' && element.textContent === text;

function team(overrides: Partial<CourtTeam> = {}): CourtTeam {
  return { teamNumber: 1, players: [], slotLabel: null, ...overrides };
}

/** 保存の状況（案内なし）に、必要な部分だけ上書きする。 */
function syncStatusOf(overrides: Partial<ScoreSyncStatus> = {}): ScoreSyncStatus {
  return {
    retryingMessage: null,
    rejectedMessage: null,
    finishing: false,
    finishRetrying: false,
    finishRejectedMessage: null,
    ...overrides,
  };
}

const baseLive: NonNullable<Court['live']> = {
  matchId: 'match-live-1',
  classLabel: { name: '2部', colorNumber: 2 },
  roundLabel: '予選 1回戦',
  teamA: team({ teamNumber: 1, players: ['佐藤', '鈴木'] }),
  teamB: team({ teamNumber: 2, players: ['高橋', '伊藤'] }),
  isMine: false,
  scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
  maxGameCount: 1,
};

/**
 * 終了の確認画面の開き閉じはページが試合ごとに覚える（use-finish-sheets.ts）ので、
 * カードだけを試すときは、その覚える役を同じ部品で付けて渡す。
 */
type HarnessProps = Omit<
  ComponentProps<typeof CourtLiveCard>,
  'finishSheetOf' | 'fix' | 'scorerOf'
> & {
  fix?: Omit<FixActions, 'finishSheetOf'>;
  /** 試合の担当の見せ方。渡さなければ、どの試合も自分が担当（＋ − が押せる）。 */
  scorer?: ScorerControl;
};

/** 担当の操作。見せ方（view）だけを替えて、押された操作は spy で受ける。 */
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

function CardHarness({ fix, scorer = scorerControl(), ...props }: HarnessProps) {
  const { finishSheetOf } = useFinishSheets(null);
  return (
    <CourtLiveCard
      {...props}
      scorerOf={() => scorer}
      finishSheetOf={finishSheetOf}
      fix={fix ? { ...fix, finishSheetOf } : undefined}
    />
  );
}

function renderLiveCard({
  live = baseLive,
  next = null,
  scores = live?.scores ?? [],
  finished = false,
  started = live !== null || hasAnyPoint(scores),
  canInput = true,
  syncStatus = null,
  onIncrement = () => {},
  onDecrement = () => {},
  onFinishMatch = () => {},
  scorer,
}: {
  scorer?: ScorerControl;
  live?: Court['live'];
  next?: Court['next'];
  scores?: GameScore[];
  finished?: boolean;
  started?: boolean;
  canInput?: boolean;
  syncStatus?: ScoreSyncStatus | null;
  onIncrement?: (gameNumber: number, side: 'A' | 'B') => void;
  onDecrement?: (gameNumber: number, side: 'A' | 'B') => void;
  onFinishMatch?: (retiredSide: 'A' | 'B' | null) => void;
} = {}) {
  const court: Court = { courtNumber: 3, live, next, fixing: [], previous: null };
  // 呼出中（live が無い）でも、選手が次の試合に点を入れ始めていれば
  // liveScore を持つ（courts-page.tsx が実際に作る状態と合わせる）。
  const hasLiveScore = live !== null || (canInput && next !== null);
  const liveScore: LiveScore | null = hasLiveScore ? { scores, finished, started } : null;
  return render(
    <CardHarness
      court={court}
      liveScore={liveScore}
      canInput={canInput}
      syncStatus={syncStatus}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onFinishMatch={onFinishMatch}
      scorer={scorer}
    />
  );
}

describe('「次のゲームへ進む」ボタン（docs/specs/2026-11-23-next-game-button.md）', () => {
  const game = (gameNumber: number, a: number, b: number) => ({
    gameNumber,
    sideAScore: a,
    sideBScore: b,
  });
  const threeGames = { ...baseLive, maxGameCount: 3 };
  const nextButton = (n: number) => screen.queryByRole('button', { name: `第${n}ゲームへ進む` });

  test('上限 3 ゲームで第1ゲームに点が入り勝負がついていないとき、「第2ゲームへ進む」と白い「ここで試合終了」と「担当をやめる」が出て、黒い「試合終了」は出ない', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15)] });

    expect(nextButton(2)).toBeInTheDocument();
    expect(nextButton(2)).toHaveClass('btn-end');
    expect(screen.getByRole('button', { name: 'ここで試合終了' })).toHaveClass('btn-quit');
    expect(screen.getByRole('button', { name: '担当をやめる' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
  });

  test('「第2ゲームへ進む」を押すと、出しているゲームが第2ゲームになり、点は 0-0 で、点は送らない', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const onFinishMatch = vi.fn();
    renderLiveCard({
      live: threeGames,
      scores: [game(1, 21, 15)],
      onIncrement,
      onDecrement,
      onFinishMatch,
    });

    fireEvent.click(nextButton(2)!);

    expect(screen.getByText('第2ゲーム')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '第2' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByTestId('team-panel-A')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-panel-B')).getByText('0')).toBeInTheDocument();
    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
    expect(onFinishMatch).not.toHaveBeenCalled();
  });

  test('ゲームが 1-1 のとき第2ゲームを出していれば「第3ゲームへ進む」が出る', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15), game(2, 15, 21)] });

    fireEvent.click(screen.getByRole('tab', { name: '第2' }));

    expect(nextButton(3)).toBeInTheDocument();
  });

  test('第3ゲーム（最後のゲーム）を出しているときは「…へ進む」は出ず、黒い「試合終了」が出る', () => {
    renderLiveCard({
      live: threeGames,
      scores: [game(1, 21, 15), game(2, 15, 21), game(3, 5, 3)],
    });

    expect(screen.queryByRole('button', { name: /ゲームへ進む/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ここで試合終了' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '試合終了' })).toHaveClass('btn-end');
  });

  test('どちらかが 2 ゲーム取ったときは「…へ進む」は出ず、黒い「試合終了」が出る', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15), game(2, 21, 18)] });

    expect(screen.queryByRole('button', { name: /ゲームへ進む/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '試合終了' })).toBeInTheDocument();
  });

  test('「ここで試合終了」を押すと、今の「試合終了」と同じ確認画面が出る', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15)] });

    fireEvent.click(screen.getByRole('button', { name: 'ここで試合終了' }));

    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  test('上限 1 ゲームの試合（予選）は今と同じ（黒い「試合終了」と「担当をやめる」だけ）', () => {
    renderLiveCard({ live: baseLive });

    expect(screen.queryByRole('button', { name: /ゲームへ進む/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ここで試合終了' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '試合終了' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '担当をやめる' })).toBeInTheDocument();
  });

  test('観戦者のカードには「…へ進む」も「ここで試合終了」も出ない', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15)], canInput: false });

    expect(screen.queryByRole('button', { name: /ゲームへ進む/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ここで試合終了' })).not.toBeInTheDocument();
  });

  test('担当でない人（他の人が担当）のカードにも出ない', () => {
    renderLiveCard({
      live: threeGames,
      scores: [game(1, 21, 15)],
      scorer: scorerControl({ kind: 'other', name: '愛知北のたろう' }),
    });

    expect(screen.queryByRole('button', { name: /ゲームへ進む/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ここで試合終了' })).not.toBeInTheDocument();
  });

  test('押せる 3 つのボタンは 44px 以上の指定（実際の大きさは e2e で測る）', () => {
    renderLiveCard({ live: threeGames, scores: [game(1, 21, 15)] });

    for (const name of ['第2ゲームへ進む', 'ここで試合終了', '担当をやめる']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    }
  });
});

describe('CourtLiveCard', () => {
  test('カードに id="court-N" が付く（進行表の［コートNの試合速報を開く］の行き先）', () => {
    const { container } = renderLiveCard();

    expect(container.querySelector('#court-3')).toBe(screen.getByTestId('court-card-3'));
  });

  test('進行中のコートに「試合中」と部が出る（回戦は出さない）', () => {
    renderLiveCard();

    expect(screen.getByText('コート3')).toBeInTheDocument();
    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
    expect(screen.getByText('2部')).toBeInTheDocument();
    expect(screen.queryByText('予選 1回戦')).not.toBeInTheDocument();
  });

  test('部の文字は部の名前で、色は並び順の番号から決まる', () => {
    renderLiveCard({
      live: { ...baseLive, classLabel: { name: '初級', colorNumber: 5 } },
    });

    expect(screen.getByText('初級')).toHaveClass('text-class-5', 'bg-class-5-bg');
  });

  test('5 番目以降のチーム番号は折り返さず、薄い色になる（1 番の色と同じにならない）', () => {
    renderLiveCard({
      live: { ...baseLive, teamA: team({ teamNumber: 5, players: ['佐藤', '鈴木'] }) },
    });

    const panel = screen.getByTestId('team-panel-A');
    expect(panel).toHaveClass('border-gray-300');
    expect(panel).not.toHaveClass('border-team-1');
  });

  test('両ペアの選手名が、1 人 1 行で出る', () => {
    renderLiveCard();

    const panelA = screen.getByTestId('team-panel-A');
    expect(within(panelA).getByText('佐藤')).toBeInTheDocument();
    expect(within(panelA).getByText('鈴木')).toBeInTheDocument();
    const panelB = screen.getByTestId('team-panel-B');
    expect(within(panelB).getByText('高橋')).toBeInTheDocument();
    expect(within(panelB).getByText('伊藤')).toBeInTheDocument();
  });

  test('出場者がまだ決まっていない側は、空枠ラベルが名前の代わりに出る', () => {
    renderLiveCard({
      live: { ...baseLive, teamB: team({ teamNumber: null, players: [], slotLabel: '予選4位' }) },
    });

    expect(screen.getByText('予選4位')).toBeInTheDocument();
    expect(screen.queryByText('高橋')).not.toBeInTheDocument();
  });

  test('チーム名が無い側（古い形の値）でも、選手名と点は出る', () => {
    renderLiveCard();

    expect(within(screen.getByTestId('team-panel-A')).getByText('10')).toBeInTheDocument();
  });

  test('予選リーグのような 1 ゲームだけの試合では「第1ゲーム」の見出しを出さない（決勝トーナメントだけに出す）', () => {
    renderLiveCard({
      live: { ...baseLive, maxGameCount: 1 },
      scores: [{ gameNumber: 1, sideAScore: 2, sideBScore: 0 }],
    });

    expect(screen.queryByText('第1ゲーム')).not.toBeInTheDocument();
    // 点の枠はいつもどおり出る
    expect(within(screen.getByTestId('team-panel-A')).getByText('2')).toBeInTheDocument();
  });

  test('上限ゲーム数が複数でも、いま入れている 1 ゲームだけが「第Nゲーム」として出る', () => {
    renderLiveCard({
      live: { ...baseLive, maxGameCount: 3 },
      scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
    });

    expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
    expect(screen.queryByText('第2ゲーム')).not.toBeInTheDocument();
    expect(screen.queryByText('第3ゲーム')).not.toBeInTheDocument();
  });

  test('点を入れる人は、タブで第2ゲームに切り替えて、まだ点の入っていない第2ゲームの枠も押せる', () => {
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

    fireEvent.click(screen.getByRole('tab', { name: '第2' }));
    expect(screen.getByText('第2ゲーム')).toBeInTheDocument();
    // 第2ゲームは 0 対 0 の枠。終わった第1ゲームは上の札に出る
    expect(screen.getByText(chip('第1G：10-8'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の第2ゲームの得点を1増やす' }));
    expect(onIncrement).toHaveBeenCalledWith(2, 'A');

    // 戻れば第1ゲームの点を直せる
    fireEvent.click(screen.getByRole('tab', { name: '第1' }));
    expect(screen.getByText('第1ゲーム')).toBeInTheDocument();
  });

  test('ゲームのタブは、点を入れる人の複数ゲーム制のカードにだけ、ゲーム数ぶん並ぶ。見ているゲームが選ばれた印になる', () => {
    const { unmount } = renderLiveCard({ live: { ...baseLive, maxGameCount: 3 } });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['第1', '第2', '第3']);
    expect(screen.getByRole('tab', { name: '第1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '第2' })).toHaveAttribute('aria-selected', 'false');
    // 見た目は低く（30px）、押せる範囲は上下に 7px ずつ見えない枠で広げて 44px（実際の大きさは e2e で測る）
    for (const tab of tabs) expect(tab).toHaveClass('h-[30px]', 'after:-inset-y-[7px]');
    fireEvent.click(screen.getByRole('tab', { name: '第3' }));
    expect(screen.getByRole('tab', { name: '第3' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('第3ゲーム')).toBeInTheDocument();
    unmount();

    const viewer = renderLiveCard({ live: { ...baseLive, maxGameCount: 3 }, canInput: false });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    viewer.unmount();

    // ゲームが 1 つしか無い試合には出ない
    renderLiveCard({ live: baseLive });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  test('自分の試合中のコートは枠が太い金色で囲まれる（「あなたの試合」の文字は出さない）', () => {
    renderLiveCard({ live: { ...baseLive, isMine: true } });

    expect(screen.getByTestId('court-card-3')).toHaveClass('court-card-mine');
    expect(screen.queryByText('あなたの試合')).not.toBeInTheDocument();
  });

  test('自分の試合でないコートは、太い金の枠にならない', () => {
    renderLiveCard({ live: { ...baseLive, isMine: false } });

    expect(screen.getByTestId('court-card-3')).not.toHaveClass('court-card-mine');
  });

  function nextMatch(
    overrides: Partial<NonNullable<Court['next']>> = {}
  ): NonNullable<Court['next']> {
    return {
      matchId: 'match-next-1',
      classLabel: { name: '1部', colorNumber: 1 },
      roundLabel: '予選 2回戦',
      teamA: team({ teamNumber: 3, players: ['山田'] }),
      teamB: team({ teamNumber: 4, players: ['中村'] }),
      isMine: false,
      maxGameCount: 1,
      ...overrides,
    };
  }

  test('進行中のカードには、次の試合は出さない（進行表で見る）', () => {
    renderLiveCard({ next: nextMatch() });

    expect(screen.queryByText('次')).not.toBeInTheDocument();
    expect(screen.queryByText('山田')).not.toBeInTheDocument();
    expect(screen.queryByText('1部')).not.toBeInTheDocument();
  });

  test('進行中の試合が無いコートは、次の試合を 0 対 0 の「呼出中」で出す（観戦者にも。ボタンは無し）', () => {
    renderLiveCard({
      live: null,
      next: nextMatch({ teamA: team({ teamNumber: 1, players: ['山田'] }) }),
      canInput: false,
    });

    expect(screen.getByTestId('court-status')).toHaveTextContent('呼出中');
    expect(within(screen.getByTestId('team-panel-A')).getByText('山田')).toBeInTheDocument();
    expect(screen.queryByText('試合中')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
  });

  test('次の試合の出場者がまだ決まっていなければ、空枠ラベルが出る', () => {
    renderLiveCard({
      live: null,
      next: nextMatch({ teamB: team({ teamNumber: null, players: [], slotLabel: '予選2位' }) }),
    });

    expect(within(screen.getByTestId('team-panel-B')).getByText('予選2位')).toBeInTheDocument();
  });

  test('進行中の試合も次の試合も無いコートに「予定なし」が出る', () => {
    renderLiveCard({ live: null, next: null });

    expect(screen.getByText('予定なし')).toBeInTheDocument();
  });

  describe('呼出中のコート（選手・canInput が true）', () => {
    function renderWaiting(overrides: Partial<Parameters<typeof renderLiveCard>[0]> = {}) {
      return renderLiveCard({
        live: null,
        next: nextMatch({ maxGameCount: 1 }),
        scores: [],
        canInput: true,
        ...overrides,
      });
    }

    test('点の枠が出て、押せる', () => {
      const onIncrement = vi.fn();
      renderWaiting({ onIncrement });

      const button = screen.getByRole('button', { name: '山田の第1ゲームの得点を1増やす' });
      fireEvent.click(button);
      expect(onIncrement).toHaveBeenCalledWith(1, 'A');
    });

    test('まだ点が入っていない間は「呼出中」のまま', () => {
      renderWaiting();

      expect(screen.getByTestId('court-status')).toHaveTextContent('呼出中');
      expect(screen.queryByText('試合中')).not.toBeInTheDocument();
    });

    test('最初の1点が入ると「試合中」の見た目に切り替わる', () => {
      renderWaiting({ scores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }] });

      expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
      expect(screen.queryByText('呼出中')).not.toBeInTheDocument();
    });

    test('一度点が入ったあと0対0に戻しても、「試合中」の見た目のまま（入口の側も呼出中に戻さない）', () => {
      renderWaiting({ scores: [{ gameNumber: 1, sideAScore: 0, sideBScore: 0 }], started: true });

      expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
      expect(screen.queryByText('呼出中')).not.toBeInTheDocument();
    });

    test('「試合中」に切り替わったあとの部・チームは次の試合の情報のまま', () => {
      renderWaiting({ scores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }] });

      expect(screen.getByText('1部')).toBeInTheDocument();
      expect(within(screen.getByTestId('team-panel-A')).getByText('山田')).toBeInTheDocument();
      expect(screen.getByTestId('team-panel-A')).toHaveClass('border-team-3');
    });
  });

  describe('保存の状況（syncStatus）', () => {
    test('送り直している間は「保存できていません」の案内が出る', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({
          retryingMessage: '保存できていません・送り直しています',
          rejectedMessage: null,
        }),
      });

      expect(screen.getByRole('status')).toHaveTextContent('保存できていません・送り直しています');
    });

    test('入口に断られたときは、その理由が出る', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({
          retryingMessage: null,
          rejectedMessage: '終了した試合です。先に「訂正」を押して、終了を取り消してください。',
        }),
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        '終了した試合です。先に「訂正」を押して、終了を取り消してください。'
      );
    });

    test('保存できていれば何も出ない', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({ retryingMessage: null, rejectedMessage: null }),
      });

      expect(screen.queryByText(/保存できていません/)).not.toBeInTheDocument();
    });

    // 仕様 2026-10-04 の 4: 終了を押しても、送れていない点がある間は案内を消さない
    // （終了の記録そのものは 1-d まで画面の中だけなので、点の保存状況は終了後も見えるべき）。
    test('試合が終了した状態でも、送り直している間は「保存できていません」が残る', () => {
      renderLiveCard({
        finished: true,
        syncStatus: syncStatusOf({
          retryingMessage: '保存できていません・送り直しています',
          rejectedMessage: null,
        }),
      });

      expect(screen.getByText('終了')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('保存できていません・送り直しています');
    });

    test('試合が終了した状態でも、入口に断られた理由は残る', () => {
      renderLiveCard({
        finished: true,
        syncStatus: syncStatusOf({
          retryingMessage: null,
          rejectedMessage: '終了した試合です。先に「訂正」を押して、終了を取り消してください。',
        }),
      });

      expect(screen.getByRole('status')).toHaveTextContent('終了した試合です');
    });

    test('試合が終了した状態で、送れていれば何も出ない', () => {
      renderLiveCard({
        finished: true,
        syncStatus: syncStatusOf({ retryingMessage: null, rejectedMessage: null }),
      });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('観戦者には、終了した状態でも案内を出さない', () => {
      renderLiveCard({
        canInput: false,
        finished: true,
        syncStatus: syncStatusOf({
          retryingMessage: '保存できていません・送り直しています',
          rejectedMessage: null,
        }),
      });

      expect(screen.queryByText(/保存できていません/)).not.toBeInTheDocument();
    });
  });

  describe('観戦者（canInput が false）', () => {
    test('「−」「＋」「試合終了」が出ない', () => {
      renderLiveCard({ canInput: false });

      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
    });

    test('得点は数字で見える', () => {
      renderLiveCard({
        canInput: false,
        scores: [{ gameNumber: 1, sideAScore: 10, sideBScore: 8 }],
      });

      expect(screen.getByText('10', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('8', { exact: true })).toBeInTheDocument();
    });
  });

  describe('「試合終了」を押したとき', () => {
    test('0対0で押すと「まだ点が入っていません」と出て、確認画面は出ない', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

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

      fireEvent.click(screen.getByRole('button', { name: 'ここで試合終了' }));

      expect(screen.getByRole('status')).toHaveTextContent('同点では終了できません');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('勝ちゲーム数に差が付いていれば確認画面が出て、まだ画面は変わらない', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 1 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
      });

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

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

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

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

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

      expect(screen.getByText(/試合の勝ち/)).toBeInTheDocument();
      expect(screen.getByText(/2-0/)).toBeInTheDocument();
    });

    test('決勝（上限3ゲーム）を1ゲームだけで終了しても、確認画面に試合の勝ちペアが出る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 19 }],
      });

      fireEvent.click(screen.getByRole('button', { name: 'ここで試合終了' }));

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

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));
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

      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onFinishMatch).toHaveBeenCalledExactlyOnceWith(null);
    });
  });

  describe('棄権を選んで終了する（docs/specs/2026-10-11-retire-match.md）', () => {
    // baseLive は 10-8 で A（佐藤・鈴木）が点数で勝っている
    function openSheet(onFinishMatch = vi.fn(), canInput = true) {
      renderLiveCard({ onFinishMatch, canInput });
      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));
      return onFinishMatch;
    }

    test('確認画面に、両ペアの名前の「棄権」ボタンが出る', () => {
      openSheet();

      expect(screen.getByRole('button', { name: '佐藤・鈴木が棄権' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(screen.getByRole('button', { name: '高橋・伊藤が棄権' })).toBeInTheDocument();
    });

    test('点数で勝っている A 側を棄権にすると、「試合の勝ち」が B 側に変わる', () => {
      openSheet();
      expect(screen.getByText(/試合の勝ち/)).toHaveTextContent('佐藤・鈴木');

      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木が棄権' }));

      expect(screen.getByText(/試合の勝ち/)).toHaveTextContent('高橋・伊藤');
      expect(screen.getByRole('button', { name: '佐藤・鈴木が棄権' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    test('もう一度押すと棄権を取り消せて、勝ちが点数のとおりに戻る', () => {
      openSheet();
      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木が棄権' }));
      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木が棄権' }));

      expect(screen.getByText(/試合の勝ち/)).toHaveTextContent('佐藤・鈴木');
    });

    test('棄権を選んで「OK」を押すと、棄権した側つきで onFinishMatch が呼ばれる', () => {
      const onFinishMatch = openSheet();
      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木が棄権' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onFinishMatch).toHaveBeenCalledExactlyOnceWith('A');
    });

    test('「戻る」で閉じて開き直すと、棄権の選択は消えている', () => {
      openSheet();
      fireEvent.click(screen.getByRole('button', { name: '高橋・伊藤が棄権' }));
      fireEvent.click(screen.getByRole('button', { name: '戻る' }));
      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

      expect(screen.getByRole('button', { name: '高橋・伊藤が棄権' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    test('同点のときは、棄権を選ぶ前に止まる（確認画面が出ない）', () => {
      renderLiveCard({ scores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 15 }] });
      fireEvent.click(screen.getByRole('button', { name: '試合終了' }));

      expect(screen.queryByRole('button', { name: '佐藤・鈴木が棄権' })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('同点では終了できません');
    });

    test('観戦者には、終了ボタンも棄権を選ぶ欄も出ない', () => {
      renderLiveCard({ canInput: false });

      expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /棄権/ })).not.toBeInTheDocument();
    });

    test('棄権で終了を送っている間は、勝ちが相手側になり「（佐藤・鈴木 棄権）」が添えられる', () => {
      renderLiveCard({
        finished: true,
        syncStatus: syncStatusOf({ finishing: true, finishRetiredSide: 'A' }),
      });

      expect(screen.getByText(/勝ち:/)).toHaveTextContent('高橋・伊藤');
      expect(screen.getByText('（佐藤・鈴木 棄権）')).toBeInTheDocument();
    });

    test('棄権の無い終了には「棄権」の文字が出ない', () => {
      renderLiveCard({ finished: true, syncStatus: syncStatusOf({ finishing: true }) });

      expect(screen.queryByText(/棄権/)).not.toBeInTheDocument();
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

    test('「−」「＋」「試合終了」が消える', () => {
      renderFinished();

      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
    });

    test('最後のゲームの点が枠に残り、札は「終了」になる', () => {
      renderFinished();

      expect(screen.getByTestId('court-status')).toHaveTextContent('終了');
      expect(within(screen.getByTestId('team-panel-A')).getByText('21')).toBeInTheDocument();
      expect(within(screen.getByTestId('team-panel-B')).getByText('15')).toBeInTheDocument();
    });

    test('複数ゲームの試合は、終わったゲームが札に残る', () => {
      renderLiveCard({
        live: { ...baseLive, maxGameCount: 3 },
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
          { gameNumber: 2, sideAScore: 21, sideBScore: 19 },
        ],
        finished: true,
      });

      expect(screen.getByText(chip('第1G：21-15'))).toBeInTheDocument();
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

    test('「次」の試合は出さない（進行表で見る）', () => {
      renderLiveCard({
        live: finishedLive,
        next: nextMatch(),
        scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 15 }],
        finished: true,
      });

      expect(screen.queryByText('次')).not.toBeInTheDocument();
      expect(screen.queryByText('山田')).not.toBeInTheDocument();
    });
  });
});

/**
 * 直し中（終了を取り消して点を直している試合）と、1 つ前（直す入口）。
 * 仕様: docs/specs/2026-10-09-courts-live-and-finish.md の決めたこと 1・受け入れ基準 9〜13。
 */
describe('直し中と1つ前', () => {
  const previousMatch: PreviousMatch = {
    matchId: 'match-prev',
    classLabel: { name: '3部', colorNumber: 3 },
    roundLabel: '予選 3回戦',
    teamA: team({ teamNumber: 3, players: ['山本', '清水'] }),
    teamB: team({ teamNumber: 4, players: ['松田', '井上'] }),
    isMine: false,
    scores: [
      { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
      { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
    ],
    maxGameCount: 3,
    ending: 'normal',
  };

  const fixingMatch: NonNullable<Court['live']> = {
    matchId: 'match-fixing',
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 2回戦',
    teamA: team({ teamNumber: 1, players: ['中村', '小林'] }),
    teamB: team({ teamNumber: 2, players: ['加藤', '吉田'] }),
    isMine: false,
    scores: [{ gameNumber: 1, sideAScore: 15, sideBScore: 21 }],
    maxGameCount: 1,
  };

  function actions(overrides: Partial<FixActions> = {}): Omit<FixActions, 'finishSheetOf'> {
    return {
      syncStatusOf: () => null,
      reopenStateOf: () => null,
      onIncrement: () => {},
      onDecrement: () => {},
      onFinishMatch: () => {},
      onReopen: () => {},
      ...overrides,
    };
  }

  function renderCard({
    court,
    canInput = true,
    fix = actions(),
    scorer,
  }: {
    court: Partial<Court>;
    canInput?: boolean;
    fix?: Omit<FixActions, 'finishSheetOf'>;
    scorer?: ScorerControl;
  }) {
    const full: Court = {
      courtNumber: 3,
      live: baseLive,
      next: null,
      fixing: [],
      previous: null,
      ...court,
    };
    const live = full.live;
    return render(
      <CardHarness
        court={full}
        liveScore={live ? { scores: live.scores, finished: false, started: true } : null}
        canInput={canInput}
        syncStatus={null}
        onIncrement={() => {}}
        onDecrement={() => {}}
        onFinishMatch={() => {}}
        fix={fix}
        scorer={scorer}
      />
    );
  }

  describe('1つ前', () => {
    test('棄権で終わった試合は、相手の勝ちと「（◯◯ 棄権）」が出る（点数では勝っていても）', () => {
      renderCard({ court: { previous: { ...previousMatch, ending: 'retired_side_a' } } });

      const row = screen.getByTestId('previous-match-3');
      expect(within(row).getByText(/勝ち:/)).toHaveTextContent('松田・井上');
      expect(within(row).getByText('（山本・清水 棄権）')).toBeInTheDocument();
    });

    test('棄権の無い試合には「棄権」の文字が出ない', () => {
      renderCard({ court: { previous: previousMatch } });

      expect(screen.queryByText(/棄権/)).not.toBeInTheDocument();
    });

    test('「1つ前」に、部・両ペアの名前・実際にプレーされたゲームの得点が出る', () => {
      renderCard({ court: { previous: previousMatch } });

      const row = screen.getByTestId('previous-match-3');
      expect(within(row).getByText('1つ前の試合')).toBeInTheDocument();
      // 1 行で「両ペア（ここではチーム名が無いので選手名）と、取ったゲーム数」。
      // 0 対 0 の枠（プレーされていないゲーム）は数えない
      expect(row).toHaveTextContent('山本・清水 1-0 松田・井上');
    });

    test('担当（自分）の選手には「訂正」が出る。観戦者には 1つ前の行ごと出ない', () => {
      const { unmount } = renderCard({ court: { previous: previousMatch }, canInput: true });
      expect(screen.getByRole('button', { name: '訂正' })).toBeInTheDocument();
      unmount();

      renderCard({ court: { previous: previousMatch }, canInput: false });
      expect(screen.queryByRole('button', { name: '訂正' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('previous-match-3')).not.toBeInTheDocument();
    });

    test('「訂正」を押すと確認が出る。「戻る」では何も取り消さない', () => {
      const onReopen = vi.fn();
      renderCard({ court: { previous: previousMatch }, fix: actions({ onReopen }) });

      fireEvent.click(screen.getByRole('button', { name: '訂正' }));
      expect(screen.getByText('この試合を訂正します')).toBeInTheDocument();
      expect(onReopen).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: '戻る' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onReopen).not.toHaveBeenCalled();
    });

    test('確認の「OK」で、その試合の取り消しが呼ばれる', () => {
      const onReopen = vi.fn();
      renderCard({ court: { previous: previousMatch }, fix: actions({ onReopen }) });

      fireEvent.click(screen.getByRole('button', { name: '訂正' }));
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onReopen).toHaveBeenCalledExactlyOnceWith('match-prev');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('取り消しを送っている間は「取り消しています」が出て、「訂正」は押せない', () => {
      renderCard({
        court: { previous: previousMatch },
        fix: actions({ reopenStateOf: () => ({ pending: true, error: null }) }),
      });

      expect(screen.getByRole('status')).toHaveTextContent('取り消しています');
      expect(screen.getByRole('button', { name: '訂正' })).toBeDisabled();
    });

    test('取り消しに失敗したら、日本語の理由が出て、もう一度押せる', () => {
      renderCard({
        court: { previous: previousMatch },
        fix: actions({
          reopenStateOf: () => ({
            pending: false,
            error: '取り消せませんでした。電波を確かめて、もう一度押してください。',
          }),
        }),
      });

      expect(screen.getByRole('status')).toHaveTextContent('取り消せませんでした');
      expect(screen.getByRole('button', { name: '訂正' })).toBeEnabled();
    });

    test('1 つ前に送れていない点の案内があれば、1 つ前の下に出す（他の人が先に終了させたとき）', () => {
      renderCard({
        court: { previous: previousMatch },
        fix: actions({
          syncStatusOf: () => ({
            retryingMessage: null,
            rejectedMessage: '終了した試合です。先に「訂正」を押して、終了を取り消してください。',
            finishing: false,
            finishRetrying: false,
            finishRejectedMessage: null,
          }),
        }),
      });

      expect(within(screen.getByTestId('previous-match-3')).getByRole('status')).toHaveTextContent(
        '終了した試合です'
      );
    });

    test('進行中も次も無いコートでも、1 つ前を出せる人にはカードを残して 1 つ前が出る', () => {
      renderCard({
        court: { live: null, next: null, previous: { ...previousMatch, isMine: true } },
        scorer: scorerControl({ kind: 'vacant' }),
      });

      expect(screen.getByText('コート3')).toBeInTheDocument();
      expect(screen.queryByText('予定なし')).not.toBeInTheDocument();
      expect(screen.getByTestId('previous-match-3')).toBeInTheDocument();
    });

    test('進行中の試合の下に出て、今の試合の点も入れられる', () => {
      const onIncrement = vi.fn();
      render(
        <CardHarness
          court={{
            courtNumber: 3,
            live: baseLive,
            next: null,
            fixing: [],
            previous: previousMatch,
          }}
          liveScore={{ scores: baseLive.scores, finished: false, started: true }}
          canInput
          syncStatus={null}
          onIncrement={onIncrement}
          onDecrement={() => {}}
          onFinishMatch={() => {}}
          fix={actions()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の第1ゲームの得点を1増やす' }));
      expect(onIncrement).toHaveBeenCalledWith(1, 'A');
      expect(screen.getByTestId('previous-match-3')).toBeInTheDocument();
    });

    test('1 つ前が無ければ何も出ない', () => {
      renderCard({ court: {} });

      expect(screen.queryByTestId('previous-match-3')).not.toBeInTheDocument();
    });
  });

  describe('直し中', () => {
    test('「もう一度終了する」の確認で棄権を選ぶと、その側つきで終了が呼ばれる', () => {
      const onFinishMatch = vi.fn();
      renderCard({ court: { fixing: [fixingMatch] }, fix: actions({ onFinishMatch }) });

      fireEvent.click(screen.getByRole('button', { name: 'もう一度終了する' }));
      fireEvent.click(screen.getByRole('button', { name: '加藤・吉田が棄権' }));
      // 点数では B が勝っているが、B 側の棄権なので A の勝ちになる
      expect(screen.getByText(/試合の勝ち/)).toHaveTextContent('中村・小林');
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      expect(onFinishMatch).toHaveBeenCalledExactlyOnceWith('match-fixing', 'B');
    });

    test('「直し中」の表示と、得点の枠が出る', () => {
      renderCard({ court: { fixing: [fixingMatch] } });

      const panel = screen.getByTestId('fixing-match-3');
      expect(within(panel).getByText('直し中')).toBeInTheDocument();
      expect(within(panel).getByText('1部')).toBeInTheDocument();
      // 1 ゲームだけの試合なので「第1ゲーム」の見出しは出ない（決勝トーナメントだけに出す）
      expect(within(panel).queryByText('第1ゲーム')).not.toBeInTheDocument();
      expect(within(panel).getByText('15')).toBeInTheDocument();
      expect(within(panel).getByText('21')).toBeInTheDocument();
    });

    test('選手は直し中の点を押せる。押した点は、その試合として渡る', () => {
      const onIncrement = vi.fn();
      const onDecrement = vi.fn();
      renderCard({
        court: { fixing: [fixingMatch] },
        fix: actions({ onIncrement, onDecrement }),
      });
      const panel = screen.getByTestId('fixing-match-3');

      fireEvent.click(
        within(panel).getByRole('button', { name: '中村・小林の第1ゲームの得点を1増やす' })
      );
      fireEvent.click(
        within(panel).getByRole('button', { name: '加藤・吉田の第1ゲームの得点を1減らす' })
      );

      expect(onIncrement).toHaveBeenCalledWith('match-fixing', 1, 'A');
      expect(onDecrement).toHaveBeenCalledWith('match-fixing', 1, 'B');
    });

    test('「もう一度終了する」→ 確認 → OK で、その試合の終了が呼ばれる', () => {
      const onFinishMatch = vi.fn();
      renderCard({ court: { fixing: [fixingMatch] }, fix: actions({ onFinishMatch }) });

      fireEvent.click(screen.getByRole('button', { name: 'もう一度終了する' }));
      expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
      expect(onFinishMatch).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      expect(onFinishMatch).toHaveBeenCalledExactlyOnceWith('match-fixing', null);
    });

    test('同点では「もう一度終了する」を押しても確認に進まず、理由が出る', () => {
      renderCard({
        court: {
          fixing: [
            {
              ...fixingMatch,
              maxGameCount: 3,
              scores: [
                { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
                { gameNumber: 2, sideAScore: 15, sideBScore: 21 },
              ],
            },
          ],
        },
      });

      fireEvent.click(screen.getByRole('button', { name: 'もう一度終了する' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('同点では終了できません', { exact: false })).toBeInTheDocument();
    });

    test('観戦者には、点を押すボタンも「もう一度終了する」も出ない。点は数字で見える', () => {
      renderCard({ court: { fixing: [fixingMatch] }, canInput: false });
      const panel = screen.getByTestId('fixing-match-3');

      expect(within(panel).getByText('直し中')).toBeInTheDocument();
      expect(within(panel).getByText('15')).toBeInTheDocument();
      expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'もう一度終了する' })).not.toBeInTheDocument();
    });

    test('終了を送っている間は「終了を送っています」が出て、ボタンは消える', () => {
      renderCard({
        court: { fixing: [fixingMatch] },
        fix: actions({
          syncStatusOf: () => ({
            retryingMessage: null,
            rejectedMessage: null,
            finishing: true,
            finishRetrying: false,
            finishRejectedMessage: null,
          }),
        }),
      });
      const panel = screen.getByTestId('fixing-match-3');

      expect(within(panel).getByRole('status')).toHaveTextContent('終了を送っています');
      expect(
        within(panel).queryByRole('button', { name: 'もう一度終了する' })
      ).not.toBeInTheDocument();
    });

    test('直し中があっても、今の試合の点は入れられ、「試合終了」も出る', () => {
      const onIncrement = vi.fn();
      render(
        <CardHarness
          court={{
            courtNumber: 3,
            live: baseLive,
            next: null,
            fixing: [fixingMatch],
            previous: null,
          }}
          liveScore={{ scores: baseLive.scores, finished: false, started: true }}
          canInput
          syncStatus={null}
          onIncrement={onIncrement}
          onDecrement={() => {}}
          onFinishMatch={() => {}}
          fix={actions()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '佐藤・鈴木の第1ゲームの得点を1増やす' }));

      expect(onIncrement).toHaveBeenCalledWith(1, 'A');
      expect(screen.getByRole('button', { name: '試合終了' })).toBeInTheDocument();
      expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');
    });

    test('今の試合が無く直し中だけのコートは「予定なし」と言わない', () => {
      renderCard({ court: { live: null, next: null, fixing: [fixingMatch] } });

      expect(screen.queryByText('予定なし')).not.toBeInTheDocument();
      expect(screen.getByTestId('fixing-match-3')).toBeInTheDocument();
    });

    // 直した人がその試合の担当になる（仕様 ⑩）。直し中の枠も、今の試合と同じ担当の見せ方をする
    describe('入力の担当（直し中の枠）', () => {
      test('自分が担当なら、直し中の枠の ＋ − と「もう一度終了する」「担当をやめる」が出る', () => {
        const onRelease = vi.fn();
        renderCard({
          court: { live: null, fixing: [fixingMatch] },
          scorer: scorerControl({ kind: 'mine' }, { onRelease }),
        });
        const panel = screen.getByTestId('fixing-match-3');

        expect(
          within(panel).getByRole('button', { name: '中村・小林の第1ゲームの得点を1増やす' })
        ).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: 'もう一度終了する' })).toBeInTheDocument();
        fireEvent.click(within(panel).getByRole('button', { name: '担当をやめる' }));
        expect(onRelease).toHaveBeenCalledTimes(1);
      });

      test('担当がいないときは、金の点線の「入力を担当する」。＋ − と終了は出ない', () => {
        const onClaim = vi.fn();
        renderCard({
          court: { live: null, fixing: [fixingMatch] },
          scorer: scorerControl({ kind: 'vacant' }, { onClaim }),
        });
        const panel = screen.getByTestId('fixing-match-3');

        expect(within(panel).getByText('入力担当がまだいません')).toBeInTheDocument();
        expect(
          within(panel).queryByRole('button', { name: /得点を1増やす/ })
        ).not.toBeInTheDocument();
        expect(
          within(panel).queryByRole('button', { name: 'もう一度終了する' })
        ).not.toBeInTheDocument();
        fireEvent.click(within(panel).getByRole('button', { name: '入力を担当する' }));
        expect(onClaim).toHaveBeenCalledTimes(1);
      });

      test('ほかの人が担当中なら、その人の名前と「入力を引き継ぐ」。＋ − と終了は出ない', () => {
        renderCard({
          court: { live: null, fixing: [fixingMatch] },
          scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }),
        });
        const panel = screen.getByTestId('fixing-match-3');

        expect(within(panel).getByText('愛知北のじろうさんが')).toBeInTheDocument();
        expect(within(panel).getByText('入力しています')).toBeInTheDocument();
        expect(within(panel).getByRole('button', { name: '入力を引き継ぐ' })).toBeInTheDocument();
        expect(
          within(panel).queryByRole('button', { name: /得点を1増やす/ })
        ).not.toBeInTheDocument();
        expect(
          within(panel).queryByRole('button', { name: 'もう一度終了する' })
        ).not.toBeInTheDocument();
      });
    });
  });
});

/**
 * 試合の入力担当（docs/specs/2026-10-14-match-scorer.md）。
 * 担当の見せ方（自分／いない／ほかの人）は渡された `scorerOf` のとおりに出す。決まり（5 分など）は
 * 画面の外（`scorer-view.ts`）。
 */
describe('CourtLiveCard の入力の担当', () => {
  const OTHER = scorerControl({ kind: 'other', name: '愛知北のじろう' });
  const VACANT = scorerControl({ kind: 'vacant' });

  test('担当がいない進行中の試合に、金の点線の「入力を担当する」が出る。＋ − と終了は出ない', () => {
    renderLiveCard({ scorer: VACANT });

    expect(screen.getByText('入力担当がまだいません')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '入力を担当する' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1減らす/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '担当をやめる' })).not.toBeInTheDocument();
  });

  test('担当がいなくても、いまの点数は数字で見える', () => {
    renderLiveCard({ scorer: VACANT });

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  test('「入力を担当する」を押すと、担当を取る操作が呼ばれる', () => {
    const onClaim = vi.fn();
    renderLiveCard({ scorer: scorerControl({ kind: 'vacant' }, { onClaim }) });

    fireEvent.click(screen.getByRole('button', { name: '入力を担当する' }));

    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  test('自分が担当なら ＋ − と「試合終了」「担当をやめる」が出る。「入力を担当する」は出ない', () => {
    renderLiveCard({ scorer: scorerControl({ kind: 'mine' }) });

    expect(
      screen.getByRole('button', { name: '佐藤・鈴木の第1ゲームの得点を1増やす' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '試合終了' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '担当をやめる' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を担当する' })).not.toBeInTheDocument();
    expect(screen.queryByText('入力担当がまだいません')).not.toBeInTheDocument();
  });

  test('「担当をやめる」を押すと、担当をやめる操作が呼ばれる', () => {
    const onRelease = vi.fn();
    renderLiveCard({ scorer: scorerControl({ kind: 'mine' }, { onRelease }) });

    fireEvent.click(screen.getByRole('button', { name: '担当をやめる' }));

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  test('ほかの人が担当中なら、灰色の帯に「◯◯さん／が入力しています」（チーム名つき）と「入力を引き継ぐ」が出る。＋ − と終了は出ない', () => {
    renderLiveCard({ scorer: OTHER });

    expect(screen.getByText('愛知北のじろうさんが')).toBeInTheDocument();
    expect(screen.getByText('入力しています')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '入力を引き継ぐ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '試合終了' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を担当する' })).not.toBeInTheDocument();
  });

  test('「入力を引き継ぐ」→ 確認「◯◯さんが入れています。引き継ぎますか？」→ OK で、引き継ぐ操作が呼ばれる', () => {
    const onTakeOver = vi.fn();
    renderLiveCard({
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }, { onTakeOver }),
    });

    fireEvent.click(screen.getByRole('button', { name: '入力を引き継ぐ' }));
    expect(
      screen.getByText('愛知北のじろうさんが入れています。引き継ぎますか？')
    ).toBeInTheDocument();
    // 確認の前は引き継がない
    expect(onTakeOver).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onTakeOver).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('確認で「戻る」を押すと、引き継がずに閉じる', () => {
    const onTakeOver = vi.fn();
    renderLiveCard({
      scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }, { onTakeOver }),
    });

    fireEvent.click(screen.getByRole('button', { name: '入力を引き継ぐ' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));

    expect(onTakeOver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('確認を開いている間に担当が自分になったら（ほかの人がやめた・自分が引き継いだ）、確認は閉じる', () => {
    const { rerender } = renderLiveCard({ scorer: OTHER });
    fireEvent.click(screen.getByRole('button', { name: '入力を引き継ぐ' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(
      <CardHarness
        court={{ courtNumber: 3, live: baseLive, next: null, fixing: [], previous: null }}
        liveScore={{ scores: baseLive.scores, finished: false, started: true }}
        canInput
        syncStatus={null}
        onIncrement={() => {}}
        onDecrement={() => {}}
        onFinishMatch={() => {}}
        scorer={VACANT}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '入力を担当する' })).toBeInTheDocument();
  });

  describe('観戦者', () => {
    test('担当がいなくても、何も出ない（「入力を担当する」も「入力担当がまだいません」も）', () => {
      renderLiveCard({ canInput: false, scorer: VACANT });

      expect(screen.queryByText('入力担当がまだいません')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '入力を担当する' })).not.toBeInTheDocument();
    });

    test('ほかの人が担当中でも、担当の名前も「入力を引き継ぐ」も出ない', () => {
      renderLiveCard({ canInput: false, scorer: OTHER });

      expect(screen.queryByText(/じろう/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '入力を引き継ぐ' })).not.toBeInTheDocument();
    });
  });

  describe('呼出中の試合（選手に出る、昇格した次の試合）', () => {
    const next: NonNullable<Court['next']> = {
      matchId: 'match-next',
      classLabel: { name: '3部', colorNumber: 3 },
      roundLabel: '予選 2回戦',
      teamA: team({ teamNumber: 1, players: ['中村', '小林'] }),
      teamB: team({ teamNumber: 2, players: ['加藤', '吉田'] }),
      isMine: false,
      maxGameCount: 1,
    };

    test('担当がいなければ、呼出中でも先に「入力を担当する」を押す。押すまで ＋ − は出ない', () => {
      renderLiveCard({ live: null, next, scores: [], started: false, scorer: VACANT });

      expect(screen.getByText('呼出中')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '入力を担当する' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /得点を1増やす/ })).not.toBeInTheDocument();
    });

    test('自分が担当なら、まだ 1 点も入っていなくても ＋ − が出る', () => {
      renderLiveCard({ live: null, next, scores: [], started: false });

      expect(
        screen.getByRole('button', { name: '中村・小林の第1ゲームの得点を1増やす' })
      ).toBeInTheDocument();
    });
  });

  describe('送った点が担当でないと断られたとき（⑧⑨）', () => {
    const rejected = syncStatusOf({
      scorerRejection: {
        message: '愛知北のじろうさんが担当しています。',
        games: [{ gameNumber: 1, sideAScore: 12, sideBScore: 10 }],
      },
    });

    test('カードの中に、担当の名前と、送れなかった点が出る', () => {
      renderLiveCard({ syncStatus: rejected, scorer: OTHER });

      expect(screen.getByText('愛知北のじろうさんが担当しています。')).toBeInTheDocument();
      expect(screen.getByText('送れなかった点：第1ゲーム 12-10')).toBeInTheDocument();
    });

    test('複数のゲームの点は、まとめて並ぶ', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({
          scorerRejection: {
            message: '愛知北のじろうさんが担当しています。',
            games: [
              { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
              { gameNumber: 2, sideAScore: 3, sideBScore: 5 },
            ],
          },
        }),
        scorer: OTHER,
      });

      expect(
        screen.getByText('送れなかった点：第1ゲーム 21-15、第2ゲーム 3-5')
      ).toBeInTheDocument();
    });

    test('「閉じる」で消せる', () => {
      const onDismissRejection = vi.fn();
      renderLiveCard({
        syncStatus: rejected,
        scorer: scorerControl({ kind: 'other', name: '愛知北のじろう' }, { onDismissRejection }),
      });

      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

      expect(onDismissRejection).toHaveBeenCalledTimes(1);
    });

    test('「閉じる」は 44px 以上、知らせは目立つ（読み上げられる）', () => {
      renderLiveCard({ syncStatus: rejected, scorer: OTHER });

      expect(screen.getByRole('button', { name: '閉じる' })).toHaveClass('min-h-11');
      expect(screen.getByRole('alert')).toHaveTextContent('愛知北のじろうさんが担当しています。');
    });

    test('担当が自分に戻っていても（引き継ぎ直した）、閉じるまで知らせは残る', () => {
      renderLiveCard({ syncStatus: rejected, scorer: scorerControl({ kind: 'mine' }) });

      expect(screen.getByText('送れなかった点：第1ゲーム 12-10')).toBeInTheDocument();
    });

    test('観戦者には出さない（点を送らないので断られることがない）', () => {
      renderLiveCard({ canInput: false, syncStatus: rejected, scorer: OTHER });

      expect(screen.queryByText(/送れなかった点/)).not.toBeInTheDocument();
    });
  });

  describe('担当を取る・やめる操作の案内', () => {
    test('取る操作を送り直している間は案内が出る。その間も ＋ − は押せる（⑤）', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({ scorerOp: { kind: 'claim', retrying: true } }),
        scorer: scorerControl({ kind: 'mine' }),
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        '入力の担当を取れていません・送り直しています'
      );
      expect(
        screen.getByRole('button', { name: '佐藤・鈴木の第1ゲームの得点を1増やす' })
      ).toBeInTheDocument();
    });

    test('やめる操作を送り直している間も案内が出る', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({ scorerOp: { kind: 'release', retrying: true } }),
        scorer: VACANT,
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        '入力の担当をやめられていません・送り直しています'
      );
    });

    test('送り直しではない（まだ最初の 1 回を送っている）間は、案内を出さない', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({ scorerOp: { kind: 'claim', retrying: false } }),
        scorer: scorerControl({ kind: 'mine' }),
      });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('断られた理由（参加者でない、など）はそのまま出る', () => {
      renderLiveCard({
        syncStatus: syncStatusOf({ scorerOpMessage: 'この大会の参加者として登録されていません。' }),
        scorer: VACANT,
      });

      expect(screen.getByRole('status')).toHaveTextContent(
        'この大会の参加者として登録されていません。'
      );
    });
  });

  test('終わったコート（終了を送っている間）には、担当の表示も操作も出ない', () => {
    renderLiveCard({ finished: true, scorer: VACANT });

    expect(screen.queryByText('入力担当がまだいません')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入力を担当する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '担当をやめる' })).not.toBeInTheDocument();
  });

  test('「入力を担当する」「入力を引き継ぐ」「担当をやめる」は 44px 以上のボタン', () => {
    const { unmount } = renderLiveCard({ scorer: VACANT });
    expect(screen.getByRole('button', { name: '入力を担当する' })).toHaveClass('min-h-[66px]');
    unmount();

    const other = renderLiveCard({ scorer: OTHER });
    expect(screen.getByRole('button', { name: '入力を引き継ぐ' })).toHaveClass('min-h-11');
    other.unmount();

    renderLiveCard({ scorer: scorerControl({ kind: 'mine' }) });
    expect(screen.getByRole('button', { name: '担当をやめる' })).toHaveClass('min-h-11');
  });
});

// 押せるところの大きさ・点滅の有無・枠線の色は jsdom では測れない（クラス名を見るだけでは実際の見た目を保証できない）。
// 実際の見た目は e2e/courts.spec.ts で Playwright に確かめさせている。
