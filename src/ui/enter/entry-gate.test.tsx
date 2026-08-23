import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EntryGate, type EnterDivision, type EnterTeam, type Entrant } from '@/ui/enter/entry-gate';

// 入場に成功すると router.refresh() で画面を描き直す作りなので、差し替えておく
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const divisions: EnterDivision[] = [
  { id: 'd1', name: '1部' },
  { id: 'd2', name: '2部' },
];

const teams: EnterTeam[] = [
  { id: 't1', number: 1, name: '愛知南' },
  { id: 't2', number: 2, name: '愛知中央' },
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
  entrant({ playerId: 'p2', number: 2, name: 'すずき', teamId: 't2', divisionId: 'd1' }),
  entrant({ playerId: 'p3', number: 3, name: 'たろう', teamId: 't1', divisionId: 'd2' }),
];

function renderGate(overrides: Partial<Parameters<typeof EntryGate>[0]> = {}) {
  return render(
    <EntryGate
      competitionName="第5回エリア対抗バド大会"
      entrants={entrants}
      teams={teams}
      divisions={divisions}
      passcodeRequired={true}
      session={null}
      {...overrides}
    />
  );
}

const VIEWER_BUTTON = /観戦の方はこちら/;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ session: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('入場画面', () => {
  test('最初に部が並ぶ（チームではない）', () => {
    renderGate();

    expect(screen.getByText('あなたの部を選んでください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1部/ })).toHaveTextContent('2名');
    expect(screen.getByRole('button', { name: /2部/ })).toHaveTextContent('1名');
  });

  test('部を選ぶと、その部の人だけがチームごとに並ぶ', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));

    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
    // チームが見出しになる
    expect(screen.getByText('愛知南')).toBeInTheDocument();
    expect(screen.getByText('愛知中央')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /さとう/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /すずき/ })).toBeInTheDocument();
    // 別の部の人は出ない
    expect(screen.queryByRole('button', { name: /たろう/ })).not.toBeInTheDocument();
  });

  test('同名を見分けられるよう、名前に番号が添えられている', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));

    expect(screen.getByRole('button', { name: /さとう/ })).toHaveTextContent('#1');
  });

  test('「← 戻る」で部選びに戻れる', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

    expect(screen.getByText('あなたの部を選んでください')).toBeInTheDocument();
  });

  test('部が 1 つも無いときは、いきなり名前が並ぶ（行き止まりにならない）', () => {
    renderGate({
      divisions: [],
      teams: [],
      entrants: [
        entrant({ playerId: 'p1', number: 1, name: 'フジ親分' }),
        entrant({ playerId: 'p2', number: 2, name: 'くみ' }),
      ],
    });

    expect(screen.queryByText('あなたの部を選んでください')).not.toBeInTheDocument();
    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
  });

  test('名前を押すと合言葉の入力が出る', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('当日配布された合言葉')).toBeInTheDocument();
    // まだサーバーには送っていない（合言葉を入れてから）
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('合言葉の欄は伏せ字ではない（伏せ字だと日本語を打てない端末がある）', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    const input = screen.getByPlaceholderText('当日配布された合言葉');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).not.toHaveAttribute('autocomplete', 'one-time-code');
  });

  test('合言葉が設定されていないときは、名前を押すとそのまま入場を送る', () => {
    renderGate({ passcodeRequired: false });
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));
    fireEvent.click(screen.getByRole('button', { name: /さとう/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({
        body: JSON.stringify({ as: 'player', playerId: 'p1', passcode: '' }),
      })
    );
  });
});

describe('観戦者の入口', () => {
  test('部を選ぶ画面の一番下にある', () => {
    renderGate();
    expect(screen.getByRole('button', { name: VIEWER_BUTTON })).toBeInTheDocument();
  });

  test('押すと合言葉を聞かれずに観戦として入る', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: VIEWER_BUTTON }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session',
      expect.objectContaining({ body: JSON.stringify({ as: 'viewer' }) })
    );
  });

  test('部が 1 つも無くて部選びを飛ばしたときも出る（置き去りにしない）', () => {
    renderGate({
      divisions: [],
      teams: [],
      entrants: [entrant({ playerId: 'p1', number: 1, name: 'フジ親分' })],
    });

    expect(screen.getByRole('button', { name: VIEWER_BUTTON })).toBeInTheDocument();
  });

  test('名前を選ぶ画面まで進んだら出ない（最初の画面だけに置く）', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /1部/ }));

    expect(screen.queryByRole('button', { name: VIEWER_BUTTON })).not.toBeInTheDocument();
  });
});

describe('入場したあと', () => {
  test('名前で入った人は、名前と番号が出て退場できる', () => {
    renderGate({
      session: {
        role: 'player',
        playerId: 'p1',
        playerName: 'さとう',
        playerNumber: 1,
        canInput: true,
      },
    });

    expect(screen.getByText('入場中')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退場する' })).toBeInTheDocument();
  });

  test('観戦者は「観戦中」と出て、書き込めないことが書いてある', () => {
    renderGate({ session: { role: 'viewer' } });

    expect(screen.getByText('観戦中')).toBeInTheDocument();
    expect(screen.getByText(/得点の書き込みはできません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '観戦をやめる' })).toBeInTheDocument();
    // 観戦中に観戦の入口をもう一度出さない
    expect(screen.queryByRole('button', { name: VIEWER_BUTTON })).not.toBeInTheDocument();
  });

  test('参加者が 1 人もいないときは登録を促す', () => {
    renderGate({ entrants: [], teams: [], divisions: [] });

    expect(screen.getByText(/参加者がまだ登録されていません/)).toBeInTheDocument();
  });
});
