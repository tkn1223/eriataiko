import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { teamBgClass } from '@/domain/class-labels';
import { KoBracket } from '@/ui/bracket/ko-bracket';
import type { KoBracketData, KoMatch, KoSlot } from '@/ui/bracket/types';

const empty = (label: string): KoSlot => ({ label, isDecided: false });
const team = (label: string, teamNumber: number): KoSlot => ({
  label,
  isDecided: true,
  teamNumber,
});

function koMatch(id: string, overrides: Partial<KoMatch> = {}): KoMatch {
  return {
    id,
    slotA: empty('空枠A'),
    slotB: empty('空枠B'),
    status: 'waiting',
    ...overrides,
  };
}

/** 予選リーグ中の形: どの枠も空枠の名前だけ。 */
const beforeLeagueEnds: KoBracketData = {
  leagueFinished: false,
  semifinals: [
    koMatch('semi-1', { slotA: empty('予選1位'), slotB: empty('予選4位') }),
    koMatch('semi-2', { slotA: empty('予選2位'), slotB: empty('予選3位') }),
  ],
  final: koMatch('final', { slotA: empty('準決勝1 勝者'), slotB: empty('準決勝2 勝者') }),
  thirdPlace: koMatch('third', { slotA: empty('準決勝1 敗者'), slotB: empty('準決勝2 敗者') }),
  champion: { decided: false },
};

describe('KoBracket', () => {
  test('決勝トーナメント側に 準決勝・決勝・優勝・3位決定戦 が出る', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    expect(screen.getByText('準決勝')).toBeInTheDocument();
    expect(screen.getByText('決勝')).toBeInTheDocument();
    expect(screen.getByText('優勝')).toBeInTheDocument();
    expect(screen.getByText('3位決定戦')).toBeInTheDocument();
  });

  test('上から 準決勝 → 決勝 → 優勝 → 3位決定戦 の順に縦に並ぶ（横に動かす枠は無い）', () => {
    const { container } = render(<KoBracket data={beforeLeagueEnds} />);

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings).toEqual(['準決勝', '決勝', '3位決定戦']);
    // 優勝の箱は、決勝の下・3位決定戦の上
    const champion = screen.getByTestId('ko-champion-box');
    const position = (element: Element) => container.innerHTML.indexOf(element.outerHTML);
    expect(position(champion)).toBeGreaterThan(position(screen.getByTestId('ko-match-final')));
    expect(position(champion)).toBeLessThan(position(screen.getByText('3位決定戦')));
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
  });

  test('準決勝の箱の上に「準決勝①」「準決勝②」と状態（まだ）が出る', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    const first = screen.getByTestId('ko-match-semi-1');
    expect(within(first).getByText('準決勝①')).toBeInTheDocument();
    expect(within(first).getByText('まだ')).toBeInTheDocument();
    expect(within(screen.getByTestId('ko-match-semi-2')).getByText('準決勝②')).toBeInTheDocument();
  });

  test('終わった準決勝の箱には「終了」が出る', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      semifinals: [
        koMatch('semi-1', {
          slotA: team('愛知南', 1),
          slotB: team('愛知西', 4),
          status: 'done',
          scoreA: 2,
          scoreB: 1,
        }),
        beforeLeagueEnds.semifinals[1],
      ],
    };
    render(<KoBracket data={data} />);

    expect(within(screen.getByTestId('ko-match-semi-1')).getByText('終了')).toBeInTheDocument();
  });

  test('決勝は、まだなら真ん中が「vs」で、試合の数字は出ない', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    expect(within(screen.getByTestId('ko-match-final')).getByText('vs')).toBeInTheDocument();
  });

  test('決勝の自分のチームの下に「自分のチーム」が出る。自分が出ていなければ出ない', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      final: koMatch('final', { slotA: team('愛知南', 1), slotB: team('愛知北', 3) }),
    };
    const { unmount } = render(<KoBracket data={data} selfTeamNumber={1} />);
    expect(within(screen.getByTestId('ko-match-final')).getAllByText('自分のチーム')).toHaveLength(
      1
    );
    unmount();

    render(<KoBracket data={data} />);
    expect(screen.queryByText('自分のチーム')).not.toBeInTheDocument();
  });

  test('優勝が決まっていなければ「優勝」の箱に「まだ決まっていません」が出る', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    expect(screen.getByText('まだ決まっていません')).toBeInTheDocument();
  });

  test('優勝が決まっていれば「優勝」の箱にチーム名が出て、「まだ決まっていません」は出ない', () => {
    render(
      <KoBracket data={{ ...beforeLeagueEnds, champion: { decided: true, teamName: '愛知南' } }} />
    );

    expect(screen.getByTestId('ko-champion-box')).toHaveTextContent('優勝愛知南');
    expect(screen.queryByText('まだ決まっていません')).not.toBeInTheDocument();
  });

  test('決まっていない枠は、表に入っている空枠の名前がそのまま出る', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    for (const label of [
      '予選1位',
      '予選2位',
      '予選3位',
      '予選4位',
      '準決勝1 勝者',
      '準決勝2 勝者',
      '準決勝1 敗者',
      '準決勝2 敗者',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test('チームが入っている枠はチーム名とチーム色の四角で出て、空の枠には四角が付かない', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      semifinals: [
        koMatch('semi-1', { slotA: team('愛知南', 1), slotB: empty('予選4位') }),
        beforeLeagueEnds.semifinals[1],
      ],
    };
    render(<KoBracket data={data} />);

    const box = screen.getByTestId('ko-match-semi-1');
    expect(within(box).getByText('愛知南')).toBeInTheDocument();
    const dots = box.querySelectorAll('[data-testid="ko-team-dot"]');
    expect(dots).toHaveLength(1);
    expect(dots[0].className).toContain(teamBgClass(1));
    expect(within(box).getByText('予選4位')).toBeInTheDocument();
  });

  test('予選リーグ中は「組み合わせは予選リーグ終了後に確定します」と出す', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    expect(screen.getByText('組み合わせは予選リーグ終了後に確定します')).toBeInTheDocument();
  });

  test('予選リーグが終わっていれば、その注記は出ない', () => {
    render(<KoBracket data={{ ...beforeLeagueEnds, leagueFinished: true }} />);

    expect(screen.queryByText('組み合わせは予選リーグ終了後に確定します')).not.toBeInTheDocument();
  });

  test('優勝が決まっていれば「🏆 優勝：◯◯」の帯を出す', () => {
    render(
      <KoBracket data={{ ...beforeLeagueEnds, champion: { decided: true, teamName: '愛知南' } }} />
    );

    expect(screen.getByText('🏆 優勝：愛知南')).toBeInTheDocument();
  });

  test('優勝が決まっていなければ、優勝の帯は出ない', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    expect(screen.queryByText(/🏆 優勝/)).not.toBeInTheDocument();
  });

  test('進行中の対戦には「試合中」の札が出て、その数字（勝ち試合数）が出る', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      final: koMatch('final', {
        slotA: team('愛知南', 1),
        slotB: team('愛知北', 3),
        status: 'live',
        scoreA: 1,
        scoreB: 0,
      }),
    };
    render(<KoBracket data={data} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(within(finalBox).getByText('試合中')).toBeInTheDocument();
    expect(finalBox).toHaveAttribute('data-status', 'live');
    expect(within(finalBox).getByTestId('ko-score-a')).toHaveTextContent('1');
    expect(within(finalBox).getByTestId('ko-score-b')).toHaveTextContent('0');
  });

  test('終わった対戦は数字が出て、勝った側の名前が太字になる', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      final: koMatch('final', {
        slotA: team('愛知南', 1),
        slotB: team('愛知北', 3),
        status: 'done',
        scoreA: 0,
        scoreB: 2,
      }),
    };
    render(<KoBracket data={data} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(finalBox).toHaveAttribute('data-status', 'done');
    expect(within(finalBox).getByTestId('ko-score-a')).toHaveTextContent('0');
    expect(within(finalBox).getByTestId('ko-score-b')).toHaveTextContent('2');
    expect(within(finalBox).getByText('愛知北').className).toContain('font-black');
    expect(within(finalBox).getByText('愛知南').className).not.toContain('font-black');
  });

  test('終わった対戦が引き分けなら、どちらの名前も太字にしない', () => {
    const data: KoBracketData = {
      ...beforeLeagueEnds,
      final: koMatch('final', {
        slotA: team('愛知南', 1),
        slotB: team('愛知北', 3),
        status: 'done',
        scoreA: 1,
        scoreB: 1,
      }),
    };
    render(<KoBracket data={data} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(within(finalBox).getByText('愛知南').className).not.toContain('font-black');
    expect(within(finalBox).getByText('愛知北').className).not.toContain('font-black');
  });

  test('まだ始まっていない対戦には「試合中」の札も数字も出ない', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(finalBox).toHaveAttribute('data-status', 'waiting');
    expect(within(finalBox).queryByText('試合中')).not.toBeInTheDocument();
    expect(within(finalBox).queryByTestId('ko-score-a')).not.toBeInTheDocument();
  });
});
