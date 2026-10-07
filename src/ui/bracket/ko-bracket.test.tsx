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

  test('進行中の対戦には LIVE が出て、その数字（勝ち試合数）が出る', () => {
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
    expect(within(finalBox).getByText('LIVE')).toBeInTheDocument();
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

  test('まだ始まっていない対戦には LIVE も数字も出ない', () => {
    render(<KoBracket data={beforeLeagueEnds} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(finalBox).toHaveAttribute('data-status', 'waiting');
    expect(within(finalBox).queryByText('LIVE')).not.toBeInTheDocument();
    expect(within(finalBox).queryByTestId('ko-score-a')).not.toBeInTheDocument();
  });
});
