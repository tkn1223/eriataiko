import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { NavbarSubtitleSetterContext } from '@/ui/navbar-subtitle';
import { BracketPage } from '@/ui/bracket/bracket-page';
import type {
  KoBracketData,
  KoBracketView,
  LeagueCard,
  StandingRow,
  Team,
} from '@/ui/bracket/types';

const teams: Team[] = [
  { number: 1, name: '愛知南' },
  { number: 2, name: '愛知中央' },
];

const leagueCards: LeagueCard[] = [
  {
    id: 'card-1-2',
    teamA: 1,
    teamB: 2,
    status: 'done',
    gamesWonA: 2,
    gamesWonB: 1,
    matches: [
      {
        id: 'm-1',
        classLabel: { name: '1部', colorNumber: 1 },
        status: 'done',
        teamAPlayers: ['佐藤', '鈴木'],
        teamBPlayers: ['山田', '田中'],
        gamesWonA: 1,
        gamesWonB: 0,
      },
    ],
  },
];

const standings: StandingRow[] = [
  {
    rank: 1,
    teamNumber: 1,
    wins: 1,
    losses: 0,
    draws: 0,
    gamesWon: 2,
    gamesLost: 1,
    pointDiff: 10,
    isSelf: false,
  },
  {
    rank: 2,
    teamNumber: 2,
    wins: 0,
    losses: 1,
    draws: 0,
    gamesWon: 1,
    gamesLost: 2,
    pointDiff: -10,
    isSelf: true,
  },
];

const waitingSlot = (label: string) => ({ label, isDecided: false });
const koData: KoBracketData = {
  leagueFinished: false,
  semifinals: [
    {
      id: 'semi-1',
      slotA: waitingSlot('予選1位'),
      slotB: waitingSlot('予選4位'),
      status: 'waiting',
    },
    {
      id: 'semi-2',
      slotA: waitingSlot('予選2位'),
      slotB: waitingSlot('予選3位'),
      status: 'waiting',
    },
  ],
  final: {
    id: 'final',
    slotA: waitingSlot('準決勝1 勝者'),
    slotB: waitingSlot('準決勝2 勝者'),
    status: 'waiting',
  },
  thirdPlace: {
    id: 'third',
    slotA: waitingSlot('準決勝1 敗者'),
    slotB: waitingSlot('準決勝2 敗者'),
    status: 'waiting',
  },
  champion: { decided: false },
};

function renderPage(
  overrides: { truncated?: boolean; koBracket?: KoBracketView; cards?: LeagueCard[] } = {}
) {
  // 上の帯は外枠が持っているので、差し込まれた中身を受け取って、あとで描いて確かめる
  const setSubtitle = vi.fn<(content: ReactNode) => void>();
  const view = render(
    <NavbarSubtitleSetterContext.Provider value={setSubtitle}>
      <BracketPage
        teams={teams}
        leagueCards={overrides.cards ?? leagueCards}
        standings={standings}
        koBracket={overrides.koBracket ?? { kind: 'ready', data: koData }}
        truncated={overrides.truncated ?? false}
      />
    </NavbarSubtitleSetterContext.Provider>
  );
  /** 帯に最後に差し込まれた中身の文字。 */
  const subtitleText = () => {
    const content = setSubtitle.mock.calls.findLast(([value]) => value !== null)?.[0];
    return render(<>{content}</>).container.textContent;
  };
  return { ...view, subtitleText };
}

describe('BracketPage', () => {
  test('上の帯の小見出しに「対戦表 ・ 予選リーグ <終了>/<全部> 対戦終了」が、渡された対戦の数どおりに出る', () => {
    const { subtitleText } = renderPage({
      cards: [
        { ...leagueCards[0], id: 'a', status: 'done' },
        { ...leagueCards[0], id: 'b', status: 'live' },
        { ...leagueCards[0], id: 'c', status: 'waiting' },
      ],
    });

    expect(subtitleText()).toBe('対戦表 ・ 予選リーグ 1/3 対戦終了');
  });

  test('予選の対戦が 0 件のときは、小見出しは「対戦表」だけ', () => {
    const { subtitleText } = renderPage({ cards: [] });

    expect(subtitleText()).toBe('対戦表');
  });

  test('本文に大きな「対戦表」の見出しは無い', () => {
    renderPage();

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText('対戦表')).not.toBeInTheDocument();
  });

  test('本文の余白は進行表と同じ（横 px-3、上 pt-3）', () => {
    const { container } = renderPage();

    expect(container.firstElementChild).toHaveClass('px-3', 'pt-3');
  });

  test('チームに入っている人には、星取表カードの右上に「自分：愛知中央」の札が出る', () => {
    renderPage();

    const card = screen.getByRole('heading', { name: '星取表' }).closest('section');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('自分：愛知中央')).toBeInTheDocument();
  });

  test('観戦者（自分のチームが無い）には、その札が出ない', () => {
    render(
      <BracketPage
        teams={teams}
        leagueCards={leagueCards}
        standings={standings.map((row) => ({ ...row, isSelf: false }))}
        koBracket={{ kind: 'ready', data: koData }}
        truncated={false}
      />
    );

    expect(screen.queryByText(/自分：/)).not.toBeInTheDocument();
  });

  test('「星取表に戻る」でも、詳細が閉じる', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    fireEvent.click(screen.getByRole('button', { name: '星取表に戻る' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('「予選リーグ」「決勝トーナメント」の切り替えが出て、押すと中身が入れ替わる', () => {
    renderPage();

    // 初期状態は予選リーグ側
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(screen.queryByText('順位表（暫定）')).not.toBeInTheDocument();
    expect(screen.getByText('準決勝')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '予選リーグ' }));
    expect(screen.getByText('順位表（暫定）')).toBeInTheDocument();
  });

  test('マスを押すと詳細が下から出て、その対戦の試合一覧が並ぶ。「閉じる」で閉じる', () => {
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '愛知南 対 愛知中央 の対戦' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '予選リーグ・対戦詳細' })).toBeInTheDocument();
    expect(screen.getByText('○ 愛知南の勝利')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('読む上限を超えていたら、出しきれていないかもしれないと知らせる', () => {
    renderPage({ truncated: true });

    expect(screen.getByRole('alert')).toHaveTextContent('出しきれていない');
  });

  test('上限を超えていなければ、その知らせは出ない', () => {
    renderPage({ truncated: false });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('決勝の対戦がまだ登録されていなければ、決勝トーナメントのタブに案内が出る', () => {
    renderPage({ koBracket: { kind: 'not-registered' } });

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(screen.getByText('決勝トーナメントの組み合わせはまだありません')).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();
  });

  test('決勝の対戦が想定と違う数なら、件数つきで運営に知らせるよう案内が出る', () => {
    renderPage({ koBracket: { kind: 'unexpected-shape', matchupCount: 5 } });

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(screen.getByText(/想定と違う形で登録されています（対戦が 5 件）/)).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();
  });

  test('決勝の対戦の並び順が重なっていれば、そのことが分かる一言つきで運営に知らせるよう案内が出る', () => {
    renderPage({ koBracket: { kind: 'duplicate-sort-order' } });

    fireEvent.click(screen.getByRole('button', { name: '決勝トーナメント' }));

    expect(
      screen.getByText(
        '決勝トーナメントの組み合わせが、想定と違う形で登録されています（対戦の並び順が重なっています）。運営の方に知らせてください。'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('準決勝')).not.toBeInTheDocument();
  });
});
