import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MyPage } from '@/ui/me/my-page';
import { NavbarSubtitleSetterContext } from '@/ui/navbar-subtitle';
import type { MyMatch, MyProfile, MyRecord } from '@/ui/me/types';

// 「名前を選ぶ画面に戻る」ボタンが画面を移すのに使う。ここでは押したあとまでは見ない
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const profile: MyProfile = {
  name: '佐々木 太郎',
  teamName: 'アリーナクラブ',
  teamNumber: 2,
  classLabel: { name: '2部', colorNumber: 2 },
};

const record: MyRecord = { wins: 1, losses: 1, gamesWon: 0, gamesLost: 0, pointDiff: 0 };

const CLASS_2 = { name: '2部', colorNumber: 2 } as const;
const CLASS_3 = { name: '3部', colorNumber: 3 } as const;

const nextMatch: MyMatch = {
  id: 'next',
  status: 'waiting',
  roundLabel: '予選 2回戦',
  partnerName: '山田',
  classLabel: CLASS_3,
  opponentNames: ['渡辺', '小林'],
  opponentTeamName: '愛知中央',
  courtNumber: 1,
  orderInCourt: 3,
};

const laterMatch: MyMatch = {
  id: 'later',
  status: 'waiting',
  roundLabel: '予選 3回戦',
  partnerName: '山田',
  classLabel: CLASS_2,
  opponentNames: ['田中'],
  opponentTeamName: '名古屋西',
  courtNumber: 2,
  orderInCourt: 7,
};

const wonMatch: MyMatch = {
  id: 'won',
  status: 'done',
  won: true,
  roundLabel: '予選 1回戦',
  classLabel: CLASS_2,
  opponentNames: ['佐藤', '鈴木'],
  opponentTeamName: '愛知中央',
  gamesWon: 1,
  gamesLost: 0,
  gameScores: [[15, 11]],
};

const lostMatch: MyMatch = {
  id: 'lost',
  status: 'done',
  won: false,
  roundLabel: '予選 1回戦',
  classLabel: CLASS_3,
  opponentNames: ['高橋'],
  opponentTeamName: null,
  gamesWon: 1,
  gamesLost: 2,
  gameScores: [
    [15, 12],
    [9, 15],
    [13, 15],
  ],
};

function renderPage(
  matches: MyMatch[],
  remainingCount = matches.filter((m) => m.status === 'waiting').length,
  p = profile
) {
  const setSubtitle = vi.fn();
  const view = render(
    <NavbarSubtitleSetterContext.Provider value={setSubtitle}>
      <MyPage profile={p} record={record} remainingCount={remainingCount} matches={matches} />
    </NavbarSubtitleSetterContext.Provider>
  );
  return { ...view, setSubtitle };
}

describe('見出し', () => {
  test('選手の名前・チーム名・部の札が出る', () => {
    renderPage([nextMatch]);
    const heading = screen.getByTestId('my-heading');

    expect(within(heading).getByText('佐々木 太郎')).toBeInTheDocument();
    expect(within(heading).getByText('アリーナクラブ')).toBeInTheDocument();
    expect(within(heading).getByText('2部')).toBeInTheDocument();
  });

  test('チーム無しは「チームなし」、部なしは札なし。アバターは薄い色で頭文字は濃い', () => {
    const { container } = renderPage([], 0, {
      ...profile,
      teamName: null,
      teamNumber: null,
      classLabel: null,
    });
    const heading = screen.getByTestId('my-heading');

    expect(within(heading).getByText('チームなし')).toBeInTheDocument();
    expect(within(heading).queryByText('2部')).not.toBeInTheDocument();
    const avatar = container.querySelector('[aria-hidden="true"].rounded-full');
    expect(avatar).toHaveClass('bg-hairline', 'text-ink');
  });

  test('チームに入っている人のアバターはチーム番号の色で、頭文字は白', () => {
    const { container } = renderPage([nextMatch], 1, { ...profile, teamNumber: 3 });

    const avatar = container.querySelector('[aria-hidden="true"].rounded-full');
    expect(avatar).toHaveClass('bg-team-3', 'text-white');
  });
});

describe('次の試合（金枠）', () => {
  test('コート番号・◯試合目・回戦・ペア・相手・相手チーム名・部の札が出る', () => {
    renderPage([nextMatch, laterMatch]);
    const card = within(screen.getByTestId('next-match'));

    expect(card.getByText('次の試合')).toBeInTheDocument();
    expect(card.getByText('コート1')).toBeInTheDocument();
    expect(card.getByText('3試合目')).toBeInTheDocument();
    expect(card.getByText('予選 2回戦')).toBeInTheDocument();
    expect(card.getByText('山田')).toBeInTheDocument();
    expect(card.getByText('渡辺・小林')).toBeInTheDocument();
    expect(card.getByText('愛知中央')).toBeInTheDocument();
    expect(card.getByText('3部')).toBeInTheDocument();
  });

  test('シングルスはペアの行を出さない', () => {
    renderPage([{ ...nextMatch, partnerName: undefined }]);

    expect(within(screen.getByTestId('next-match')).queryByText('ペア')).not.toBeInTheDocument();
  });

  test('コート未定は「コート未定」と、決まるとここに出るという案内が出る', () => {
    renderPage([{ ...nextMatch, courtNumber: null }]);
    const card = within(screen.getByTestId('next-match'));

    expect(card.getByText('コート未定')).toBeInTheDocument();
    expect(card.getByText('コートが決まるとここに大きく出ます')).toBeInTheDocument();
  });

  test('順番未定は「順番未定」と出る', () => {
    renderPage([{ ...nextMatch, orderInCourt: undefined }]);

    expect(within(screen.getByTestId('next-match')).getByText('順番未定')).toBeInTheDocument();
  });

  test('相手チーム名が無ければ（null）チーム名は出さない', () => {
    renderPage([{ ...nextMatch, opponentTeamName: null }]);

    expect(screen.getByTestId('next-match')).not.toHaveTextContent('愛知中央');
  });
});

describe('そのあとの試合', () => {
  test('残りの未実施が、渡された順に「予定」の印つきで並ぶ', () => {
    const second = { ...laterMatch, id: 'second', orderInCourt: 8 };
    renderPage([nextMatch, laterMatch, second]);

    const list = screen.getByTestId('later-matches');
    expect(within(list).getByText('そのあとの試合')).toBeInTheDocument();
    const cards = within(list).getAllByTestId(/^match-/);
    expect(cards.map((card) => card.dataset.testid)).toEqual(['match-later', 'match-second']);
    expect(within(cards[0]).getByText('予定')).toBeInTheDocument();
  });

  test('回戦・部の札・vs 相手・相手チーム名・「◯◯ とペア」・コートと◯試合目が出る', () => {
    renderPage([nextMatch, laterMatch]);
    const card = within(screen.getByTestId('match-later'));

    expect(card.getByText('予選 3回戦')).toBeInTheDocument();
    expect(card.getByText('2部')).toBeInTheDocument();
    expect(card).toBeTruthy();
    expect(screen.getByTestId('match-later')).toHaveTextContent('vs 田中');
    expect(card.getByText('名古屋西')).toBeInTheDocument();
    expect(screen.getByTestId('match-later')).toHaveTextContent('山田 とペア');
    expect(card.getByText('コート2')).toBeInTheDocument();
    expect(card.getByText('7試合目')).toBeInTheDocument();
  });

  test('コート未定・順番未定は、それぞれ「コート未定」「順番未定」と出る', () => {
    renderPage([nextMatch, { ...laterMatch, courtNumber: null, orderInCourt: undefined }]);
    const card = within(screen.getByTestId('match-later'));

    expect(card.getByText('コート未定')).toBeInTheDocument();
    expect(card.getByText('順番未定')).toBeInTheDocument();
  });

  test('未実施が 1 つだけのときは見出しごと出ない', () => {
    renderPage([nextMatch]);

    expect(screen.queryByText('そのあとの試合')).not.toBeInTheDocument();
  });
});

describe('終わった試合', () => {
  test('見出しの右に「◯勝◯敗」が出る', () => {
    renderPage([nextMatch, wonMatch, lostMatch]);

    expect(within(screen.getByTestId('finished-heading')).getByText('1勝1敗')).toBeInTheDocument();
    expect(screen.getByText('終わった試合')).toBeInTheDocument();
  });

  test('終わった試合が無ければ見出しごと出ない', () => {
    renderPage([nextMatch]);

    expect(screen.queryByText('終わった試合')).not.toBeInTheDocument();
  });

  test('勝は「勝」、負は「負」の印。ゲーム数と各ゲームの点が出る', () => {
    renderPage([nextMatch, wonMatch, lostMatch]);
    const won = within(screen.getByTestId('match-won'));
    const lost = within(screen.getByTestId('match-lost'));

    expect(won.getByText('勝')).toBeInTheDocument();
    expect(won.getByTestId('game-count')).toHaveTextContent('1-0');
    expect(won.getByText('15-11')).toBeInTheDocument();
    expect(lost.getByText('負')).toBeInTheDocument();
    expect(lost.getByTestId('game-count')).toHaveTextContent('1-2');
    expect(lost.getByText('15-12 / 9-15 / 13-15')).toBeInTheDocument();
  });

  test('勝・負の印は読み上げでも「勝ち」「負け」と伝わる', () => {
    renderPage([nextMatch, wonMatch, lostMatch]);

    expect(
      within(screen.getByTestId('match-won')).getByRole('img', { name: '勝ち' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('match-lost')).getByRole('img', { name: '負け' })
    ).toBeInTheDocument();
  });

  test('勝は金の塗り、負は白抜きの枠', () => {
    renderPage([nextMatch, wonMatch, lostMatch]);

    expect(within(screen.getByTestId('match-won')).getByText('勝')).toHaveClass('bg-gold-ink');
    expect(within(screen.getByTestId('match-lost')).getByText('負')).toHaveClass('bg-white');
  });

  test('終わった試合は 1 枚のカードにまとまる', () => {
    renderPage([nextMatch, wonMatch, lostMatch]);
    const card = screen.getByTestId('finished-card');

    expect(within(card).getAllByTestId(/^match-/)).toHaveLength(2);
  });

  test('相手チーム名が出る', () => {
    renderPage([wonMatch], 0);

    expect(within(screen.getByTestId('match-won')).getByText('愛知中央')).toBeInTheDocument();
  });

  test('棄権で終わった試合に「（◯◯ 棄権）」が濃い金で添えられる。棄権の無い試合には出ない', () => {
    renderPage([{ ...lostMatch, retiredNames: ['山田', '自分'] }, wonMatch], 0);

    const note = within(screen.getByTestId('match-lost')).getByText('（山田・自分 棄権）');
    expect(note).toHaveClass('text-gold-ink');
    expect(within(screen.getByTestId('match-won')).queryByText(/棄権/)).not.toBeInTheDocument();
  });
});

describe('全試合が終わったとき', () => {
  test('金枠に「全試合が終わりました」と「◯勝◯敗」が出て、次の試合の枠は出ない', () => {
    renderPage([wonMatch, lostMatch], 0);
    const frame = within(screen.getByTestId('all-finished'));

    expect(frame.getByText('全試合が終わりました')).toBeInTheDocument();
    expect(frame.getByText('1勝1敗')).toBeInTheDocument();
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument();
  });

  test('試合中だけが残っているときは、金枠を出さない', () => {
    renderPage([wonMatch], 1);

    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-finished')).not.toBeInTheDocument();
  });
});

describe('試合が 1 つも無い人', () => {
  test('「まだ試合が登録されていません」が出る', () => {
    renderPage([], 0);

    expect(screen.getByText('まだ試合が登録されていません')).toBeInTheDocument();
    expect(screen.queryByText('全試合が終わりました')).not.toBeInTheDocument();
  });
});

describe('ヘッダーの小見出し', () => {
  test('未実施があれば「myページ · あと◯試合」（試合中も数える）', () => {
    const { setSubtitle } = renderPage([nextMatch], 3);

    expect(setSubtitle).toHaveBeenCalledWith('myページ · あと3試合');
  });

  test('全部終わっていれば「myページ · 全試合終了」', () => {
    const { setSubtitle } = renderPage([wonMatch], 0);

    expect(setSubtitle).toHaveBeenCalledWith('myページ · 全試合終了');
  });
});

describe('一番下のボタン', () => {
  test('「‹ 名前を選ぶ画面に戻る」が押すと退場するボタンで、一番下にある', () => {
    renderPage([nextMatch, wonMatch]);

    const button = screen.getByRole('button', { name: '‹ 名前を選ぶ画面に戻る' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '別の人として入り直す' })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBe(button);
  });
});

describe('出さないもの', () => {
  test('通算の「ゲーム」「得失点」と、旧来の「今大会の試合」は出ない', () => {
    renderPage([nextMatch, wonMatch]);

    expect(screen.queryByText(/得失点/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ゲーム\s*\d/)).not.toBeInTheDocument();
    expect(screen.queryByText('今大会の試合')).not.toBeInTheDocument();
  });
});
