import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EntryGate, type EnterDivision, type EnterTeam, type Entrant } from '@/ui/enter/entry-gate';

// 入場に成功すると router.refresh() で画面を描き直す作りなので、差し替えておく
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const teams: EnterTeam[] = [
  { id: 't1', number: 1, name: '愛知南' },
  { id: 't2', number: 2, name: '愛知中央' },
];

const divisions: EnterDivision[] = [
  { id: 'd1', name: '1部' },
  { id: 'd2', name: '2部' },
];

function entrant(overrides: Partial<Entrant> & Pick<Entrant, 'playerId' | 'number' | 'name'>) {
  return {
    entryId: `e-${overrides.playerId}`,
    canInput: true,
    teamId: null,
    divisionId: null,
    ...overrides,
  } satisfies Entrant;
}

const entrants: Entrant[] = [
  entrant({ playerId: 'p1', number: 1, name: 'さとう', teamId: 't1', divisionId: 'd1' }),
  entrant({ playerId: 'p2', number: 2, name: 'すずき', teamId: 't1', divisionId: 'd2' }),
  entrant({ playerId: 'p3', number: 3, name: 'たろう', teamId: 't2', divisionId: 'd1' }),
  // 試合に出ない入力係。チームも部も無い
  entrant({ playerId: 'p99', number: 99, name: '本部', teamId: null, divisionId: null }),
];

function renderGate(overrides: Partial<Parameters<typeof EntryGate>[0]> = {}) {
  return render(
    <EntryGate
      competitionName="えりあ太鼓 大会 2027"
      entrants={entrants}
      teams={teams}
      divisions={divisions}
      passcodeRequired={true}
      session={null}
      {...overrides}
    />
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ session: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('入場画面', () => {
  test('チームが複数あるときは、チームと人数が並ぶ', () => {
    renderGate();

    expect(screen.getByText('あなたのチームを選んでください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /愛知南/ })).toHaveTextContent('2名');
    expect(screen.getByRole('button', { name: /愛知中央/ })).toHaveTextContent('1名');
    // チームに属さない人も選べる場所がある
    expect(screen.getByRole('button', { name: /チームなし/ })).toHaveTextContent('1名');
  });

  test('チームを選ぶと、そのチームの人だけが部ごとに並ぶ', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));

    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /さとう/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /すずき/ })).toBeInTheDocument();
    // 別のチームの人は出ない
    expect(screen.queryByRole('button', { name: /たろう/ })).not.toBeInTheDocument();
  });

  test('同名を見分けられるよう、名前に番号が添えられている', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));

    expect(screen.getByRole('button', { name: /さとう/ })).toHaveTextContent('#1');
  });

  test('「← 戻る」でチーム選びに戻れる', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

    expect(screen.getByText('あなたのチームを選んでください')).toBeInTheDocument();
  });

  test('チームが 1 つも無いときは、いきなり名前が並ぶ（行き止まりにならない）', () => {
    renderGate({
      teams: [],
      divisions: [],
      entrants: [
        entrant({ playerId: 'p1', number: 1, name: 'フジ親分' }),
        entrant({ playerId: 'p2', number: 2, name: 'くみ' }),
      ],
    });

    expect(screen.queryByText('あなたのチームを選んでください')).not.toBeInTheDocument();
    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /フジ親分/ })).toBeInTheDocument();
  });

  test('名前を押すと合言葉の入力が出る', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('当日配布された合言葉')).toBeInTheDocument();
    // まだサーバーには送っていない（合言葉を入れてから）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('合言葉の欄は伏せ字ではない（伏せ字だと日本語を打てない端末がある）', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    const input = screen.getByPlaceholderText('当日配布された合言葉');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).not.toHaveAttribute('autocomplete', 'one-time-code');
  });

  test('合言葉が設定されていないときは、名前を押すとそのまま入場を送る', () => {
    renderGate({ passcodeRequired: false });
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('入場中は名前と番号が出て、退場できる', () => {
    renderGate({
      session: { playerId: 'p1', playerName: 'さとう', playerNumber: 1, canInput: true },
    });

    expect(screen.getByText('入場中')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退場する' })).toBeInTheDocument();
    expect(screen.queryByText('あなたのチームを選んでください')).not.toBeInTheDocument();
  });

  test('参加者が 1 人もいないときは登録を促す', () => {
    renderGate({ entrants: [], teams: [], divisions: [] });

    expect(screen.getByText(/参加者がまだ登録されていません/)).toBeInTheDocument();
  });
});
