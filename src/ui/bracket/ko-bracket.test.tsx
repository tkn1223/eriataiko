import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { KoBracket } from '@/ui/bracket/ko-bracket';
import { sampleKoBracket } from '@/ui/bracket/sample-data';

describe('KoBracket', () => {
  test('決勝トーナメント側に 準決勝・決勝・優勝・3位決定戦 が出る', () => {
    render(<KoBracket data={sampleKoBracket} />);

    expect(screen.getByText('準決勝')).toBeInTheDocument();
    expect(screen.getByText('決勝')).toBeInTheDocument();
    expect(screen.getByText('優勝')).toBeInTheDocument();
    expect(screen.getByText('3位決定戦')).toBeInTheDocument();
  });

  test('決まっていない枠は「予選 1位」「準決勝1 勝者」のように出る', () => {
    render(<KoBracket data={sampleKoBracket} />);

    expect(screen.getByText('予選 1位')).toBeInTheDocument();
    expect(screen.getByText('予選 2位')).toBeInTheDocument();
    expect(screen.getByText('予選 3位')).toBeInTheDocument();
    expect(screen.getByText('予選 4位')).toBeInTheDocument();
    expect(screen.getByText('準決勝1 勝者')).toBeInTheDocument();
    expect(screen.getByText('準決勝2 勝者')).toBeInTheDocument();
  });

  test('予選リーグ中は「組み合わせは予選リーグ終了後に確定します」と出す', () => {
    render(<KoBracket data={sampleKoBracket} />);

    expect(screen.getByText('組み合わせは予選リーグ終了後に確定します')).toBeInTheDocument();
  });

  test('予選リーグが終わっていれば、その注記は出ない', () => {
    render(<KoBracket data={{ ...sampleKoBracket, leagueFinished: true }} />);

    expect(screen.queryByText('組み合わせは予選リーグ終了後に確定します')).not.toBeInTheDocument();
  });

  test('優勝が決まっていれば「🏆 優勝：◯◯」の帯を出す', () => {
    render(
      <KoBracket data={{ ...sampleKoBracket, champion: { decided: true, teamName: '愛知南' } }} />
    );

    expect(screen.getByText('🏆 優勝：愛知南')).toBeInTheDocument();
  });

  test('優勝が決まっていなければ、優勝の帯は出ない', () => {
    render(<KoBracket data={sampleKoBracket} />);

    expect(screen.queryByText(/🏆 優勝/)).not.toBeInTheDocument();
  });

  test('進行中の対戦には LIVE が出る', () => {
    const liveData = {
      ...sampleKoBracket,
      final: { ...sampleKoBracket.final, status: 'live' as const },
    };
    render(<KoBracket data={liveData} />);

    const finalBox = screen.getByTestId('ko-match-final');
    expect(within(finalBox).getByText('LIVE')).toBeInTheDocument();
  });
});
