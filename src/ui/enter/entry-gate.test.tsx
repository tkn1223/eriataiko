import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EntryGate, type EnterDivision, type EnterTeam, type Entrant } from '@/ui/enter/entry-gate';

// 入場に成功すると router.refresh() で画面を描き直す作りなので、差し替えておく
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const teams: EnterTeam[] = [
  { id: 't1', teamNumber: 1, name: '愛知南' },
  { id: 't2', teamNumber: 2, name: '愛知中央' },
];

const divisions: EnterDivision[] = [
  { id: 'd1', name: '1部' },
  { id: 'd2', name: '2部' },
];

function entrant(
  overrides: Partial<Entrant> & Pick<Entrant, 'playerId' | 'playerNumber' | 'name'>
) {
  return {
    participantId: `e-${overrides.playerId}`,
    teamId: null,
    divisionId: null,
    ...overrides,
  } satisfies Entrant;
}

const entrants: Entrant[] = [
  entrant({ playerId: 'p1', playerNumber: 1, name: 'さとう', teamId: 't1', divisionId: 'd1' }),
  entrant({ playerId: 'p2', playerNumber: 2, name: 'すずき', teamId: 't1', divisionId: 'd2' }),
  entrant({ playerId: 'p3', playerNumber: 3, name: 'たろう', teamId: 't2', divisionId: 'd1' }),
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
  test('最初にチームが並ぶ', () => {
    renderGate();

    expect(screen.getByText('あなたのチームを選んでください')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /愛知南/ })).toHaveTextContent('2名');
    expect(screen.getByRole('button', { name: /愛知中央/ })).toHaveTextContent('1名');
  });

  test('チームを選ぶと、そのチームの人だけが部ごとに並ぶ', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));

    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
    // 部が見出しになる
    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
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

  test('部が設定されていない人も、見出しなしで名前が出る', () => {
    renderGate({
      entrants: [
        entrant({
          playerId: 'p1',
          playerNumber: 1,
          name: 'さとう',
          teamId: 't1',
          divisionId: 'd1',
        }),
        // 部だけ空。試合には出るが部が未定の人。
        entrant({
          playerId: 'p9',
          playerNumber: 9,
          name: 'はやし',
          teamId: 't1',
          divisionId: null,
        }),
        // チームが 1 つだけだとチーム選びが出ないので、2 チーム目にも 1 人置く
        entrant({
          playerId: 'p3',
          playerNumber: 3,
          name: 'たろう',
          teamId: 't2',
          divisionId: 'd1',
        }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));

    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /さとう/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /はやし/ })).toBeInTheDocument();
  });

  test('「← 戻る」でチーム選びに戻れる', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));
    fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

    expect(screen.getByText('あなたのチームを選んでください')).toBeInTheDocument();
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
      expect.objectContaining({
        body: JSON.stringify({ as: 'player', playerId: 'p1', passcode: '' }),
      })
    );
  });
});

/**
 * チーム分けをしない大会もある。そのとき参加の記録にはチームが入らないので、
 * **チームを選ぶ手順そのものが要らなくなる。**
 */
describe('チーム分けの無い大会', () => {
  const soloEntrants = [
    entrant({ playerId: 'p1', playerNumber: 1, name: 'フジ親分', divisionId: 'd1' }),
    entrant({ playerId: 'p2', playerNumber: 2, name: 'くみ', divisionId: 'd2' }),
    entrant({ playerId: 'p3', playerNumber: 3, name: 'たかな', divisionId: 'd1' }),
  ];

  test('チームを選ぶ画面が出ず、いきなり名前が並ぶ', () => {
    renderGate({ teams: [], entrants: soloEntrants });

    expect(screen.queryByText('あなたのチームを選んでください')).not.toBeInTheDocument();
    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /フジ親分/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /くみ/ })).toBeInTheDocument();
  });

  test('部の見出しは今までどおり出る', () => {
    renderGate({ teams: [], entrants: soloEntrants });

    expect(screen.getByText('1部')).toBeInTheDocument();
    expect(screen.getByText('2部')).toBeInTheDocument();
  });

  test('戻る先が無いので「← 戻る」も出ない', () => {
    renderGate({ teams: [], entrants: soloEntrants });

    expect(screen.queryByRole('button', { name: '← 戻る' })).not.toBeInTheDocument();
  });

  test('名前を押せば今までどおり合言葉に進める', () => {
    renderGate({ teams: [], entrants: soloEntrants });
    fireEvent.click(screen.getByRole('button', { name: /フジ親分/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('チームの表はあるのに誰も所属していない大会でも、チーム選びは出ない', () => {
    // 前の大会のチームが残っているだけ、という状況
    renderGate({ teams, entrants: soloEntrants });

    expect(screen.queryByText('あなたのチームを選んでください')).not.toBeInTheDocument();
    expect(screen.getByText('あなたの名前をタップ')).toBeInTheDocument();
  });
});

describe('観戦者の入口', () => {
  test('チームを選ぶ画面の一番下にある', () => {
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

  test('チーム選びが出ない大会でも、名前の一覧の下に出る（置き去りにしない）', () => {
    renderGate({
      teams: [],
      entrants: [entrant({ playerId: 'p1', playerNumber: 1, name: 'フジ親分' })],
    });

    expect(screen.getByRole('button', { name: VIEWER_BUTTON })).toBeInTheDocument();
  });

  test('名前を選ぶ画面まで進んだら出ない（最初の画面だけに置く）', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: /愛知南/ }));

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
