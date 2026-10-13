import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { MatchRow } from '@/ui/matches/match-row';
import { boardMatch } from '@/ui/matches/test-support';

/**
 * 進行表の試合の行。見るだけで、押しても何も起きない
 * （得点を入れる場所は結果LIVE だけ。docs/specs/2026-10-14-matches-real-data.md の「決めたこと」1・2）。
 */

const doneMatch = boardMatch({
  matchId: 'm-done',
  status: 'done',
  orderInCourt: 1,
  maxGameCount: 3,
  teamA: { teamNumber: 1, players: ['佐藤', '鈴木'], slotLabel: null },
  teamB: { teamNumber: 2, players: ['高橋', '伊藤'], slotLabel: null },
  scores: [
    { gameNumber: 1, sideAScore: 21, sideBScore: 15 },
    { gameNumber: 2, sideAScore: 21, sideBScore: 18 },
  ],
});

const liveMatch = boardMatch({
  matchId: 'm-live',
  status: 'live',
  orderInCourt: 3,
  classLabel: { name: '2部', colorNumber: 2 },
  isMine: true,
  maxGameCount: 3,
  teamA: { teamNumber: 3, players: ['渡辺'], slotLabel: null },
  teamB: { teamNumber: 4, players: ['山本'], slotLabel: null },
  scores: [
    { gameNumber: 1, sideAScore: 21, sideBScore: 19 },
    { gameNumber: 2, sideAScore: 10, sideBScore: 8 },
  ],
});

const waitingMatch = boardMatch({
  matchId: 'm-waiting',
  status: 'waiting',
  orderInCourt: 5,
  classLabel: { name: '3部', colorNumber: 3 },
  teamA: { teamNumber: 1, players: ['中村'], slotLabel: null },
  teamB: { teamNumber: 2, players: ['木村'], slotLabel: null },
});

/** 名前の見た目（勝ちは太字、負けはグレー）を取り出す。 */
function nameStyleOf(rowTestId: string, name: string) {
  const element = within(screen.getByTestId(rowTestId)).getByText(name);
  return {
    bold: element.className.includes('font-black'),
    gray: element.className.includes('text-gray-500'),
  };
}

describe('MatchRow', () => {
  test('試合の行に 試合順・部・両ペアの名前・スコアが出る', () => {
    render(<MatchRow match={doneMatch} />);

    const row = screen.getByTestId('match-row-m-done');
    expect(row).toHaveTextContent('1試合目');
    expect(row).toHaveTextContent('1部');
    expect(row).toHaveTextContent('佐藤・鈴木');
    expect(row).toHaveTextContent('高橋・伊藤');
    expect(row).toHaveTextContent('21-15 / 21-18');
  });

  test('進行中の行は、終わったゲームと今のゲームの点が並び、LIVE が出る', () => {
    render(<MatchRow match={liveMatch} />);

    const row = screen.getByTestId('match-row-m-live');
    expect(row).toHaveTextContent('21-19 / 10-8');
    expect(row).toHaveTextContent('LIVE');
  });

  test('終了・未実施の行には「LIVE」が出ない', () => {
    render(<MatchRow match={doneMatch} />);
    expect(screen.getByTestId('match-row-m-done')).not.toHaveTextContent('LIVE');

    render(<MatchRow match={waitingMatch} />);
    expect(screen.getByTestId('match-row-m-waiting')).not.toHaveTextContent('LIVE');
  });

  test('進行中の行を含め、どの行も押せない（ボタンが無く、得点入力は出ない）', () => {
    render(
      <>
        <MatchRow match={doneMatch} />
        <MatchRow match={liveMatch} />
        <MatchRow match={waitingMatch} />
      </>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('0 対 0 の枠（まだ始まっていないゲーム）は点数に出さない', () => {
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-empty',
          status: 'live',
          scores: [
            { gameNumber: 1, sideAScore: 21, sideBScore: 5 },
            { gameNumber: 2, sideAScore: 0, sideBScore: 0 },
          ],
        })}
      />
    );

    expect(screen.getByTestId('match-row-m-empty')).toHaveTextContent('21-5');
    expect(screen.getByTestId('match-row-m-empty')).not.toHaveTextContent('0-0');
  });

  test('未実施の試合にはスコアが出ない', () => {
    render(<MatchRow match={waitingMatch} />);

    expect(screen.queryByText(/^\d+-\d+$/)).not.toBeInTheDocument();
  });

  test('自分の試合には「あなたの試合」の印が出る。自分の試合でなければ出ない', () => {
    render(<MatchRow match={liveMatch} />);
    expect(screen.getByTestId('match-row-m-live')).toHaveTextContent('あなたの試合');

    render(<MatchRow match={doneMatch} />);
    expect(screen.getByTestId('match-row-m-done')).not.toHaveTextContent('あなたの試合');
  });

  test('終わった試合は、勝った側の名前が太字、負けた側はグレー', () => {
    render(<MatchRow match={doneMatch} />);

    expect(nameStyleOf('match-row-m-done', '佐藤・鈴木')).toEqual({ bold: true, gray: false });
    expect(nameStyleOf('match-row-m-done', '高橋・伊藤')).toEqual({ bold: false, gray: true });
  });

  test('B 側が勝った試合は、B 側が太字になる', () => {
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-b-wins',
          status: 'done',
          scores: [{ gameNumber: 1, sideAScore: 12, sideBScore: 21 }],
        })}
      />
    );

    expect(nameStyleOf('match-row-m-b-wins', '高橋・伊藤').bold).toBe(true);
    expect(nameStyleOf('match-row-m-b-wins', '佐藤・鈴木').gray).toBe(true);
  });

  test('進行中・未実施の試合は、どちらも太字にしない', () => {
    render(<MatchRow match={liveMatch} />);

    expect(nameStyleOf('match-row-m-live', '渡辺')).toEqual({ bold: false, gray: false });
    expect(nameStyleOf('match-row-m-live', '山本')).toEqual({ bold: false, gray: false });
  });

  test('棄権の試合は、点数で勝っていても相手が太字になり、「棄権」の印が出る', () => {
    // A 側が 21-5 で勝っているが、A 側が棄権 → 相手（B 側）の勝ち
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-retired',
          status: 'done',
          ending: 'retired_side_a',
          scores: [{ gameNumber: 1, sideAScore: 21, sideBScore: 5 }],
        })}
      />
    );

    expect(nameStyleOf('match-row-m-retired', '高橋・伊藤')).toEqual({ bold: true, gray: false });
    expect(nameStyleOf('match-row-m-retired', '佐藤・鈴木')).toEqual({ bold: false, gray: true });
    const row = screen.getByTestId('match-row-m-retired');
    expect(row).toHaveTextContent('佐藤・鈴木 棄権');
    // 点数は代わりの試合の点数のまま出す
    expect(row).toHaveTextContent('21-5');
  });

  test('棄権の印は棄権した側にだけ付く（B 側が棄権なら B 側）', () => {
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-retired-b',
          status: 'done',
          ending: 'retired_side_b',
          scores: [{ gameNumber: 1, sideAScore: 3, sideBScore: 21 }],
        })}
      />
    );

    const row = screen.getByTestId('match-row-m-retired-b');
    expect(row).toHaveTextContent('高橋・伊藤 棄権');
    expect(row).not.toHaveTextContent('佐藤・鈴木 棄権');
    expect(nameStyleOf('match-row-m-retired-b', '佐藤・鈴木').bold).toBe(true);
  });

  test('棄権でない試合には「棄権」の印が出ない', () => {
    render(<MatchRow match={doneMatch} />);

    expect(screen.getByTestId('match-row-m-done')).not.toHaveTextContent('棄権');
  });

  test('ペアがまだ決まっていない側は、空枠ラベル（例: 予選1位）を出す', () => {
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-slot',
          teamA: { teamNumber: 1, players: ['佐藤'], slotLabel: null },
          teamB: { teamNumber: null, players: [], slotLabel: '予選1位' },
        })}
      />
    );

    expect(screen.getByTestId('match-row-m-slot')).toHaveTextContent('予選1位');
  });

  test('ペアも空枠ラベルも無い側は「未定」と出す（空のままにしない）', () => {
    render(
      <MatchRow
        match={boardMatch({
          matchId: 'm-none',
          teamB: { teamNumber: null, players: [], slotLabel: null },
        })}
      />
    );

    expect(screen.getByTestId('match-row-m-none')).toHaveTextContent('未定');
  });

  test('試合順が未定の試合は「順番未定」と出す（「null試合目」にしない）', () => {
    render(<MatchRow match={boardMatch({ matchId: 'm-no-order', orderInCourt: null })} />);

    const row = screen.getByTestId('match-row-m-no-order');
    expect(row).toHaveTextContent('順番未定');
    expect(row).not.toHaveTextContent('null');
  });
});
