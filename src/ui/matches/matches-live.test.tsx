import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CourtsPage } from '@/ui/courts/courts-page';
import { appScoreSyncStore } from '@/ui/courts/use-score-sync';
import { MatchesPage } from '@/ui/matches/matches-page';
import { boardMatch } from '@/ui/matches/test-support';
import type { BoardMatch } from '@/ui/matches/types';

/**
 * 進行表が、他の人の点や試合の終了を**その場で映す**ことの確認。
 *
 * 結果LIVE と同じ購読（`@/ui/courts/use-live-updates`）と、届いた行を当てる判断
 * （`apply-live-change.ts`）をそのまま使っているので、ここでは購読の本物（`appLiveHub`）を使い、
 * 一番外側の Supabase のクライアントだけを偽物にする。そうすれば
 * 「購読が進行表でも本当に当たる」ことと、「読み直しの回数」を確かめられる。
 *
 * 仕様: docs/specs/2026-10-14-matches-real-data.md
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

type FakeChannel = {
  name: string;
  /** removeChannel に渡される本体。どの購読が止められたかを見分けるのに使う。 */
  handle: unknown;
  bindings: { event: string; table: string; callback: (payload: { new: unknown }) => void }[];
  status: ((status: string) => void) | null;
  system: ((payload: unknown) => void) | null;
};
const fake = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  removeChannel: vi.fn(),
}));
vi.mock('@/db/client', () => ({
  getSupabaseBrowserClient: () => ({
    channel(name: string) {
      const record: FakeChannel = { name, handle: null, bindings: [], status: null, system: null };
      fake.channels.push(record);
      const channel = {
        on(
          type: string,
          filter: { event?: string; table?: string },
          callback: (payload: never) => void
        ) {
          if (type === 'system') {
            record.system = callback as (payload: unknown) => void;
          } else {
            record.bindings.push({
              event: filter.event ?? '',
              table: filter.table ?? '',
              callback: callback as FakeChannel['bindings'][number]['callback'],
            });
          }
          return channel;
        },
        subscribe(callback: (status: string) => void) {
          record.status = callback;
          return channel;
        },
      };
      record.handle = channel;
      return channel;
    },
    removeChannel: fake.removeChannel,
  }),
}));

function currentChannel(): FakeChannel {
  const channel = fake.channels.at(-1);
  if (!channel) throw new Error('購読がまだ始まっていない');
  return channel;
}

/**
 * 本物は SUBSCRIBED のあとに、データベースの変化の購読が整った知らせ（system ok）が別に届く。
 * 「つながった」は後者なので、SUBSCRIBED を流すときは続けて system ok も流す。
 */
function setStatus(status: string) {
  act(() => {
    const channel = currentChannel();
    channel.status?.(status);
    if (status === 'SUBSCRIBED') {
      channel.system?.({ status: 'ok', extension: 'postgres_changes' });
    }
  });
}

/** 購読に、他の人が起こした変化を届ける（Supabase から届く行の形そのまま）。 */
function deliver(table: 'matches' | 'game_scores', event: 'UPDATE' | 'INSERT', row: unknown) {
  act(() => {
    for (const binding of currentChannel().bindings) {
      if (binding.table === table && binding.event === event) binding.callback({ new: row });
    }
  });
}

function deliverScore(matchId: string, gameNumber: number, sideAScore: number, sideBScore: number) {
  deliver('game_scores', 'UPDATE', {
    match_id: matchId,
    game_number: gameNumber,
    side_a_score: sideAScore,
    side_b_score: sideBScore,
  });
}

function deliverMatch(
  matchId: string,
  overrides: Partial<{
    status: string;
    court_number: number | null;
    order_in_court: number | null;
    finished_at: string | null;
    ending: string;
  }> = {}
) {
  deliver('matches', 'UPDATE', {
    id: matchId,
    status: 'live',
    court_number: 1,
    order_in_court: 1,
    finished_at: null,
    max_game_count: 1,
    ending: 'normal',
    ...overrides,
  });
}

function twoMatchBoard(): BoardMatch[] {
  return [
    boardMatch({
      matchId: 'm-live',
      status: 'live',
      orderInCourt: 1,
      maxGameCount: 3,
      teamA: { teamNumber: 1, players: ['中村'], slotLabel: null },
      teamB: { teamNumber: 2, players: ['加藤'], slotLabel: null },
      scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 9 }],
    }),
    boardMatch({ matchId: 'm-next', status: 'waiting', orderInCourt: 2 }),
  ];
}

/** 進行表の画面。props は変わらない部分をまとめる（コート 1 の全試合＝1b を開いた状態が既定）。 */
function PageUnderTest({
  board,
  initialCourt = 1,
}: {
  board: BoardMatch[];
  initialCourt?: number | null;
}) {
  return (
    <MatchesPage
      board={board}
      truncated={false}
      initialCourt={initialCourt}
      stageLabel="予選リーグ"
      completedMatches={0}
      totalMatches={2}
    />
  );
}

function renderPage(board: BoardMatch[] = twoMatchBoard(), initialCourt: number | null = 1) {
  return render(<PageUnderTest board={board} initialCourt={initialCourt} />);
}

/** 試合の行の、片側の点（試合中はいまのゲームの点）。 */
function scoreOf(matchId: string, side: 'A' | 'B'): string {
  return screen.getByTestId(`match-row-${matchId}-scoreline-${side}`).textContent ?? '';
}

/** 読み直しの予定（まとめて待つ間）を進める。 */
function passRefreshWait() {
  act(() => {
    vi.advanceTimersByTime(5000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fake.channels.length = 0;
  fake.removeChannel.mockClear();
  refresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  // 結果LIVE の画面も描くテストがあるので、アプリ全体で 1 つの預かり場所を次のテストに持ち越さない
  appScoreSyncStore.dispose();
});

/** まだ止められていない（つながったままの）購読。 */
function activeChannels(): FakeChannel[] {
  const removed = new Set(fake.removeChannel.mock.calls.map(([handle]) => handle));
  return fake.channels.filter((channel) => !removed.has(channel.handle));
}

describe('他の人の点がその場で映る（結果LIVE と同じ購読・同じ当てかた）', () => {
  test('進行表を開くと購読が始まり、つながると「自動更新が止まっています」は出ない', () => {
    renderPage();
    setStatus('SUBSCRIBED');

    expect(fake.channels).toHaveLength(1);
    expect(screen.queryByText(/自動更新が止まっています/)).not.toBeInTheDocument();
  });

  test('結果LIVE で入った点が、開き直さなくても進行表の同じ試合に映る', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    expect(scoreOf('m-live', 'A')).toBe('12');
    expect(scoreOf('m-live', 'B')).toBe('9');

    deliverScore('m-live', 1, 13, 9);

    expect(scoreOf('m-live', 'A')).toBe('13');
    expect(scoreOf('m-live', 'B')).toBe('9');
  });

  test('新しく始まったゲームの点が、2 ゲーム目として並んで映る', () => {
    renderPage();
    setStatus('SUBSCRIBED');

    deliver('game_scores', 'INSERT', {
      match_id: 'm-live',
      game_number: 2,
      side_a_score: 1,
      side_b_score: 0,
    });

    // 試合中の行は、いまのゲーム（2 ゲーム目）の点を出す
    expect(scoreOf('m-live', 'A')).toBe('1');
    expect(scoreOf('m-live', 'B')).toBe('0');
    expect(screen.getByTestId('match-row-m-live')).toHaveTextContent('第2ゲーム');
  });

  test('結果LIVE で試合が終了すると、そのコートの「現在◯試合目」「残り◯試合」が変わる', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    const court = screen.getByTestId('court-matches');
    expect(court).toHaveTextContent('0/2 ・ 残り2');
    expect(screen.getByTestId('court-status')).toHaveTextContent('試合中');

    deliverMatch('m-live', { status: 'done', finished_at: '2027-01-01T00:00:00Z' });

    expect(court).toHaveTextContent('1/2 ・ 残り1');
    expect(screen.getByTestId('court-status')).toHaveTextContent('呼出待ち');
  });

  test('始まった試合は LIVE になり、勝ち負けは終了したときに付く', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    expect(screen.getByTestId('match-row-m-next')).not.toHaveTextContent('試合中');

    deliverMatch('m-next', { status: 'live', order_in_court: 2 });
    expect(screen.getByTestId('match-row-m-next')).toHaveTextContent('試合中');

    deliverMatch('m-live', { status: 'done', finished_at: '2027-01-01T00:00:00Z' });
    // 終わった試合は「終わった試合」の見出しに移り、負けた側（B 側）の名前が薄くなる
    const row = screen.getByTestId('match-row-m-live');
    expect(within(row).getByText('加藤').className).toContain('text-[#6b665f]');
    expect(within(row).getByText('中村').className).not.toContain('text-[#6b665f]');
  });

  test('結果LIVE で棄権で終了すると、点数と関係なく相手が太字になり「棄権」の印が出る', () => {
    renderPage();
    setStatus('SUBSCRIBED');

    deliverMatch('m-live', {
      status: 'done',
      finished_at: '2027-01-01T00:00:00Z',
      ending: 'retired_side_a',
    });

    const row = screen.getByTestId('match-row-m-live');
    // 点数は A 側が 12-9 でリードしているが、A 側（中村）が棄権 → B 側（加藤）の勝ち（A 側の名前が薄くなる）
    expect(within(row).getByText('中村').className).toContain('text-[#6b665f]');
    expect(within(row).getByText('加藤').className).not.toContain('text-[#6b665f]');
    expect(
      within(screen.getByTestId('match-row-m-live-line-A')).getByText('棄権')
    ).toBeInTheDocument();
  });

  test('コートや順番が変わった試合は、新しいコートのカードに移る', () => {
    renderPage(
      [
        boardMatch({ matchId: 'm-a', courtNumber: null, orderInCourt: null }),
        boardMatch({ matchId: 'm-b', courtNumber: 1, orderInCourt: 1 }),
      ],
      null
    );
    setStatus('SUBSCRIBED');
    expect(screen.getByTestId('matches-undecided')).toBeInTheDocument();

    deliverMatch('m-a', { status: 'waiting', court_number: 2, order_in_court: 1 });

    expect(screen.queryByTestId('matches-undecided')).not.toBeInTheDocument();
    expect(screen.getByTestId('matches-court-card-2')).toBeInTheDocument();
  });
});

describe('読み直しの回数（点のたびに読み直さない）', () => {
  test('つながったときに 1 回だけ読み直す（つながる前の変化を取り戻すため）', () => {
    renderPage();
    expect(refresh).not.toHaveBeenCalled();

    setStatus('SUBSCRIBED');
    passRefreshWait();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('点が何度変わっても（知っている試合なら）読み直さない', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    passRefreshWait();
    refresh.mockClear();

    for (let point = 13; point <= 30; point += 1) deliverScore('m-live', 1, point, 9);
    deliverMatch('m-live', { status: 'done', finished_at: '2027-01-01T00:00:00Z' });
    passRefreshWait();

    expect(refresh).not.toHaveBeenCalled();
  });

  test('手元に無い試合の変化が続けて届いても、読み直しは 1 回にまとまる', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    passRefreshWait();
    refresh.mockClear();

    deliverScore('unknown-1', 1, 1, 0);
    deliverMatch('unknown-2');
    deliverScore('unknown-1', 1, 2, 0);
    passRefreshWait();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('自動更新が途切れると案内が出て、つながると案内が消えて 1 回だけ読み直す', () => {
    renderPage();
    setStatus('SUBSCRIBED');
    passRefreshWait();
    refresh.mockClear();

    setStatus('CHANNEL_ERROR');
    expect(screen.getByRole('status')).toHaveTextContent('自動更新が止まっています');
    passRefreshWait();
    expect(refresh).not.toHaveBeenCalled();

    setStatus('SUBSCRIBED');
    expect(screen.queryByText(/自動更新が止まっています/)).not.toBeInTheDocument();
    passRefreshWait();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('読み直した一覧が届いたら置き換わり、読み直しの間に届いた点は消えずに当て直される', () => {
    const { rerender } = renderPage();
    setStatus('SUBSCRIBED');
    passRefreshWait(); // 読み直し開始（この後に届いた変化を覚える）

    // 読み直しの返事を待っている間に、点が届いた
    deliverScore('m-live', 1, 15, 9);
    expect(scoreOf('m-live', 'A')).toBe('15');

    // サーバーが少し前に読んだ一覧（12-9）が届いても、届いた点（15-9）を消さない
    rerender(<PageUnderTest board={twoMatchBoard()} />);

    expect(scoreOf('m-live', 'A')).toBe('15');
  });

  test('読み直した一覧に新しい試合があれば、画面に増える', () => {
    const { rerender } = renderPage();
    setStatus('SUBSCRIBED');
    passRefreshWait();

    rerender(
      <PageUnderTest
        board={[
          ...twoMatchBoard(),
          boardMatch({
            matchId: 'm-new',
            status: 'waiting',
            orderInCourt: 3,
            teamA: { teamNumber: 1, players: ['新人'], slotLabel: null },
          }),
        ]}
      />
    );

    expect(screen.getByTestId('match-row-m-new')).toHaveTextContent('新人');
  });
});

describe('購読はアプリ全体で 1 本。進行表を離れたら止める', () => {
  test('進行表を閉じると購読を止める', () => {
    const { unmount } = renderPage();
    setStatus('SUBSCRIBED');
    expect(fake.removeChannel).not.toHaveBeenCalled();

    unmount();

    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  test('閉じたあとに読み直しの予定が残っていても、実行しない', () => {
    const { unmount } = renderPage();
    setStatus('SUBSCRIBED'); // 読み直しの予定が入る
    unmount();
    passRefreshWait();

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('結果LIVE と進行表を行き来しても、購読はアプリ全体で 1 本のまま', () => {
  const board = twoMatchBoard();

  function Courts() {
    return (
      <CourtsPage
        board={board}
        stageLabel="予選リーグ"
        completedMatches={0}
        totalMatches={2}
        canInput={false}
        emptyReason={null}
        truncated={false}
        myParticipantId={null}
        scorerLabels={{}}
      />
    );
  }

  function Matches() {
    return (
      <section data-testid="matches-screen">
        <PageUnderTest board={board} initialCourt={null} />
      </section>
    );
  }

  /** 下のメニューで画面を移るのと同じく、前の画面を閉じて次の画面を開く。 */
  function Screen({ at }: { at: 'courts' | 'matches' }) {
    return at === 'courts' ? <Courts /> : <Matches />;
  }

  test('行き来を繰り返しても、つながっている購読は常に 1 本。戻った進行表にも点が映る', () => {
    const view = render(<Screen at="matches" />);
    setStatus('SUBSCRIBED');

    for (let round = 0; round < 3; round += 1) {
      view.rerender(<Screen at="courts" />);
      expect(activeChannels()).toHaveLength(1);
      setStatus('SUBSCRIBED');

      view.rerender(<Screen at="matches" />);
      expect(activeChannels()).toHaveLength(1);
      setStatus('SUBSCRIBED');
    }

    // 離れた画面の古い購読から遅れて「閉じた」が届いても、いまの進行表は「止まっています」にならない
    act(() => fake.channels[0].status?.('CLOSED'));
    expect(screen.queryByTestId('live-down-notice')).not.toBeInTheDocument();

    // コート 1 のカードを開く（1b）
    act(() => within(screen.getByTestId('matches-court-card-1')).getByRole('button').click());
    deliverScore('m-live', 1, 13, 9);
    expect(scoreOf('m-live', 'A')).toBe('13');
  });

  test('2 つの画面が同時に開いていても 1 本。片方を閉じても、もう片方には届き続ける', () => {
    function Both({ showCourts }: { showCourts: boolean }) {
      return (
        <div>
          {showCourts && <Courts />}
          <Matches />
        </div>
      );
    }
    const view = render(<Both showCourts />);
    setStatus('SUBSCRIBED');
    expect(fake.channels).toHaveLength(1);

    view.rerender(<Both showCourts={false} />);
    expect(fake.removeChannel).not.toHaveBeenCalled();

    const matchesScreen = within(screen.getByTestId('matches-screen'));
    act(() =>
      within(matchesScreen.getByTestId('matches-court-card-1')).getByRole('button').click()
    );
    deliverScore('m-live', 1, 13, 9);
    expect(matchesScreen.getByTestId('match-row-m-live-scoreline-A')).toHaveTextContent('13');

    view.unmount();
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });
});
