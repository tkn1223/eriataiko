import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CorrectMatchForm } from '@/ui/matches/correct-match-form';
import { boardMatch } from '@/ui/matches/test-support';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const sendRequest = vi.hoisted(() => vi.fn());
vi.mock('@/ui/courts/send-request', () => ({ sendRequest }));

/**
 * 2b 直す画面。手元の値だけを変え、［この内容で訂正する］で全部まとめて送る。
 * 仕様: docs/specs/2026-11-22-matches-redesign.md
 */

const match = boardMatch({
  matchId: 'm-2',
  courtNumber: 1,
  orderInCourt: 2,
  status: 'done',
  ending: 'retired_side_b',
  maxGameCount: 3,
  teamA: { teamNumber: 1, teamName: 'あおぞら', players: ['ハルキ', 'ミドリ'], slotLabel: null },
  teamB: { teamNumber: 3, teamName: 'さくら', players: ['シン', 'ヒナ'], slotLabel: null },
  scores: [
    { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
    { gameNumber: 2, sideAScore: 8, sideBScore: 3 },
  ],
});

beforeEach(() => {
  push.mockReset();
  sendRequest.mockReset();
  sendRequest.mockResolvedValue({ ok: true });
});

function plus(side: 'A' | 'B', game: number) {
  const name = side === 'A' ? 'ハルキ・ミドリ' : 'シン・ヒナ';
  return screen.getByRole('button', { name: `${name}の第${game}ゲームの得点を1増やす` });
}
function minus(side: 'A' | 'B', game: number) {
  const name = side === 'A' ? 'ハルキ・ミドリ' : 'シン・ヒナ';
  return screen.getByRole('button', { name: `${name}の第${game}ゲームの得点を1減らす` });
}

describe('2b 直す画面', () => {
  test('ゲームのタブに元の点が出る。最後のゲームの次は「＋第3ゲーム」', () => {
    render(<CorrectMatchForm match={match} />);

    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /第1ゲーム.*21-15/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /第2ゲーム.*8-3/ })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: '＋第3ゲーム' })).toBeInTheDocument();
  });

  test('開いた直後は最後のゲーム（第2）が選ばれ、得点板に元の点が出る。変更は無いので「元は」も出ない', () => {
    render(<CorrectMatchForm match={match} />);

    expect(within(screen.getByTestId('team-panel-A')).getByText('8')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-panel-B')).getByText('3')).toBeInTheDocument();
    expect(screen.queryByText(/元は/)).not.toBeInTheDocument();
  });

  test('［＋］［−］は各板の真下に、同じ大きさ（高さ 46px）で並ぶ', () => {
    render(<CorrectMatchForm match={match} />);

    for (const button of [plus('A', 2), minus('A', 2), plus('B', 2), minus('B', 2)]) {
      expect(button.className).toMatch(/h-\[46px\]/);
    }
  });

  test('点を変えると、その点の下に「元は ◯」が出て、下のまとめに「第◯ゲーム ◯-◯ → ◯-◯」が出る', () => {
    render(<CorrectMatchForm match={match} />);

    fireEvent.click(plus('A', 2));
    fireEvent.click(minus('B', 2));

    expect(within(screen.getByTestId('team-panel-A')).getByText('元は 8')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-panel-B')).getByText('元は 3')).toBeInTheDocument();
    expect(screen.getByTestId('change-summary')).toHaveTextContent('第2ゲーム 8-3 → 9-2');
  });

  test('点の数字を押すと数字で直接入れられる（確定すると点が変わり、「元は」が出る）', () => {
    render(<CorrectMatchForm match={match} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'ハルキ・ミドリの第2ゲームの点を入力する' })
    );
    const input = screen.getByRole('textbox', { name: 'ハルキ・ミドリの第2ゲームの点' });
    fireEvent.change(input, { target: { value: '21' } });
    fireEvent.blur(input);

    expect(within(screen.getByTestId('team-panel-A')).getByText('21')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-panel-A')).getByText('元は 8')).toBeInTheDocument();
  });

  test('数字でない入力は 0 以上の整数に直る（空は 0）', () => {
    render(<CorrectMatchForm match={match} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'ハルキ・ミドリの第2ゲームの点を入力する' })
    );
    const input = screen.getByRole('textbox', { name: 'ハルキ・ミドリの第2ゲームの点' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(within(screen.getByTestId('team-panel-A')).getByText('0')).toBeInTheDocument();
  });

  test('タブで別のゲームに切り替えられる。「＋第3ゲーム」で新しいゲームを足せる', () => {
    render(<CorrectMatchForm match={match} />);

    fireEvent.click(screen.getByRole('tab', { name: /第1ゲーム/ }));
    expect(within(screen.getByTestId('team-panel-A')).getByText('21')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '＋第3ゲーム' }));
    expect(within(screen.getByTestId('team-panel-A')).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /第3ゲーム/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('棄権は 3 択（なし・A が棄権・B が棄権）。いまの記録に印が付き、選ぶと「棄権を外す」がまとめに出る', () => {
    render(<CorrectMatchForm match={match} />);

    const group = screen.getByRole('radiogroup', { name: '棄権' });
    const none = within(group).getByRole('radio', { name: '棄権なし' });
    const b = within(group).getByRole('radio', { name: /シン・ヒナ が棄権/ });
    expect(b).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveTextContent('いまの記録');
    expect(within(group).getByRole('radio', { name: /ハルキ・ミドリ が棄権/ })).toBeInTheDocument();

    fireEvent.click(none);

    expect(none).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('change-summary')).toHaveTextContent('棄権を外す');
  });

  test('変えていないあいだは［この内容で訂正する］が押せない', () => {
    render(<CorrectMatchForm match={match} />);

    expect(screen.getByRole('button', { name: 'この内容で訂正する' })).toBeDisabled();
    expect(screen.getByTestId('change-summary')).toHaveTextContent('まだ変えていません');
  });

  test('同点になる直し方は、日本語の理由が出て、送れない', () => {
    render(<CorrectMatchForm match={match} />);

    // 第 2 ゲームを 3-21 にして 1-1 の同点にする
    fireEvent.click(
      screen.getByRole('button', { name: 'ハルキ・ミドリの第2ゲームの点を入力する' })
    );
    const a = screen.getByRole('textbox', { name: 'ハルキ・ミドリの第2ゲームの点' });
    fireEvent.change(a, { target: { value: '3' } });
    fireEvent.blur(a);
    fireEvent.click(screen.getByRole('button', { name: 'シン・ヒナの第2ゲームの点を入力する' }));
    const b = screen.getByRole('textbox', { name: 'シン・ヒナの第2ゲームの点' });
    fireEvent.change(b, { target: { value: '21' } });
    fireEvent.blur(b);

    expect(screen.getByRole('alert')).toHaveTextContent('同点では訂正できません。どちらかが勝つ点にしてください。');
    expect(screen.getByRole('button', { name: 'この内容で訂正する' })).toBeDisabled();
  });

  test('［この内容で訂正する］で全ゲームの点と棄権をまとめて送り、詳しい画面（?corrected=直したゲーム）へ戻る', async () => {
    render(<CorrectMatchForm match={match} />);
    fireEvent.click(plus('A', 2));
    fireEvent.click(screen.getByRole('radio', { name: '棄権なし' }));

    fireEvent.click(screen.getByRole('button', { name: 'この内容で訂正する' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/matches/m-2?corrected=2'));
    expect(sendRequest).toHaveBeenCalledWith({
      url: '/api/matches/m-2/correction',
      method: 'PUT',
      body: {
        scores: [
          { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
          { gameNumber: 2, sideAScore: 9, sideBScore: 3 },
          { gameNumber: 3, sideAScore: 0, sideBScore: 0 },
        ],
        retiredSide: null,
      },
    });
  });

  test('棄権だけを直したときは corrected=0（点は直していない）で戻る', async () => {
    render(<CorrectMatchForm match={match} />);
    fireEvent.click(screen.getByRole('radio', { name: '棄権なし' }));

    fireEvent.click(screen.getByRole('button', { name: 'この内容で訂正する' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/matches/m-2?corrected=0'));
  });

  test('入口が断ったら、日本語の理由が画面に出て、画面は移らない', async () => {
    sendRequest.mockResolvedValue({
      ok: false,
      kind: 'http',
      status: 409,
      message: 'この試合はまだ終わっていません。試合中の点は試合速報で直してください。',
    });
    render(<CorrectMatchForm match={match} />);
    fireEvent.click(plus('A', 2));

    fireEvent.click(screen.getByRole('button', { name: 'この内容で訂正する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('試合速報で直してください');
    expect(push).not.toHaveBeenCalled();
  });

  test('電波が切れて送れなかったときも、日本語で出して、もう一度押せる', async () => {
    sendRequest.mockResolvedValue({ ok: false, kind: 'network' });
    render(<CorrectMatchForm match={match} />);
    fireEvent.click(plus('A', 2));

    fireEvent.click(screen.getByRole('button', { name: 'この内容で訂正する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('つながりませんでした');
    expect(screen.getByRole('button', { name: 'この内容で訂正する' })).toBeEnabled();
  });

  test('［やめる］は詳しい画面へ戻るリンク', () => {
    render(<CorrectMatchForm match={match} />);

    expect(screen.getByRole('link', { name: /やめる/ })).toHaveAttribute('href', '/matches/m-2');
  });

  test('保存ボタンは 48px、数字を入れる欄・棄権の行は 46px 以上', () => {
    render(<CorrectMatchForm match={match} />);

    expect(screen.getByRole('button', { name: 'この内容で訂正する' }).className).toMatch(
      /min-h-12/
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.className).toMatch(/min-h-\[46px\]/);
    }
  });
});
