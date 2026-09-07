import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CourtsPage } from '@/ui/courts/courts-page';
import { sampleCourts } from '@/ui/courts/sample-data';

function renderPage() {
  return render(<CourtsPage courts={sampleCourts} completedMatches={2} totalMatches={48} />);
}

describe('CourtsPage', () => {
  test('見出し「結果LIVE」が出る', () => {
    renderPage();
    expect(screen.getByText('結果LIVE')).toBeInTheDocument();
  });

  test('「予選リーグ」のラベルと「2/48 試合消化」が出る', () => {
    renderPage();

    expect(screen.getByText('予選リーグ')).toBeInTheDocument();
    expect(screen.getByText('2/48 試合消化')).toBeInTheDocument();
  });

  test('「まだ保存されません」の帯が出る', () => {
    renderPage();

    expect(
      screen.getByText('入れた点はまだ保存されません（画面を閉じると消えます）')
    ).toBeInTheDocument();
  });

  test('コートのカードが8枚出る', () => {
    renderPage();

    for (let courtNumber = 1; courtNumber <= 8; courtNumber += 1) {
      expect(screen.getByTestId(`court-card-${courtNumber}`)).toBeInTheDocument();
    }
  });

  test('「＋」を押すと得点が1増える', () => {
    renderPage();
    const card = screen.getByTestId('court-card-1');

    // コート1 は予選（上限1ゲーム）。佐々木・井上（A）20点 / 田中・木村（B）19点 から始まる
    expect(within(card).getByText('20')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
    );
    expect(within(card).getByText('21')).toBeInTheDocument();
  });

  test('「−」を押すと得点が1減る', () => {
    renderPage();
    const card = screen.getByTestId('court-card-1');

    expect(within(card).getByText('19')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '田中・木村の第1ゲームの得点を1減らす' })
    );
    expect(within(card).getByText('18')).toBeInTheDocument();
  });

  test('「−」を押しても0より下にはならない', () => {
    renderPage();
    const card = screen.getByTestId('court-card-4');

    // コート4 は予選（上限1ゲーム）。加藤・斎藤（B）5点 から始まる
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click(
        within(card).getByRole('button', { name: '加藤・斎藤の第1ゲームの得点を1減らす' })
      );
    }
    expect(within(card).getByText('0')).toBeInTheDocument();
  });

  test('コートごとに得点の増減が独立している（他のコートに影響しない）', () => {
    renderPage();
    const card1 = screen.getByTestId('court-card-1');
    const card2 = screen.getByTestId('court-card-2');

    fireEvent.click(
      within(card1).getByRole('button', { name: '佐々木・井上の第1ゲームの得点を1増やす' })
    );

    expect(within(card1).getByText('21')).toBeInTheDocument();
    // コート2 は 山田・中川（A）14点のまま変わらない
    expect(within(card2).getByText('14')).toBeInTheDocument();
  });

  test('決勝（上限3ゲーム）は、第2ゲームの枠に既に入っている点をそのまま押して動かせる', () => {
    renderPage();
    // コート5 は決勝（上限3ゲーム）。第1ゲーム 21-19、第2ゲームが 5-8 まで入っている。
    const card = screen.getByTestId('court-card-5');

    expect(within(card).getByText('第1ゲーム')).toBeInTheDocument();
    expect(within(card).getByText('第2ゲーム')).toBeInTheDocument();
    expect(within(card).getByText('第3ゲーム')).toBeInTheDocument();

    fireEvent.click(
      within(card).getByRole('button', { name: '藤田・岡田の第2ゲームの得点を1増やす' })
    );
    expect(within(card).getByText('9')).toBeInTheDocument();
  });

  test('勝ちゲーム数に差が付いていれば「試合を終了する」→確認画面の「OK」で試合終了になる', () => {
    renderPage();
    // コート4 は予選（上限1ゲーム）。松本・中村（A）8点 対 加藤・斎藤（B）5点。
    const card = screen.getByTestId('court-card-4');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
    expect(screen.getByText('この試合を終了します')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(within(card).getByText('終了')).toBeInTheDocument();
    expect(within(card).queryByText('LIVE')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '試合を終了する' })).not.toBeInTheDocument();
    expect(within(card).getByText('第1ゲーム 8-5')).toBeInTheDocument();
    expect(within(card).getByText(/勝ち/)).toBeInTheDocument();
    expect(within(card).getByText(/1-0/)).toBeInTheDocument();
  });

  test('決勝（上限3ゲーム）のコートは、2ゲーム先取で試合終了になる', () => {
    renderPage();
    // コート5 は決勝。第1ゲーム 21-19 を A（石川・前田）が取り、第2ゲームは 5-8。
    // A を 4 点足して 9-8 にすれば、この第2ゲームで 2-0 になり試合が終わる。
    const card = screen.getByTestId('court-card-5');
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(
        within(card).getByRole('button', { name: '石川・前田の第2ゲームの得点を1増やす' })
      );
    }

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
    expect(screen.getByText('この試合を終了します')).toBeInTheDocument();
    expect(screen.getByText(/2-0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(within(card).getByText('終了')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: '試合を終了する' })).not.toBeInTheDocument();
    expect(within(card).getByText('第2ゲーム 9-8')).toBeInTheDocument();
    expect(within(card).getByText(/勝ち/)).toBeInTheDocument();
    expect(within(card).getByText(/2-0/)).toBeInTheDocument();
  });

  test('確認画面で「戻る」を押すと何も変わらずに閉じる', () => {
    renderPage();
    const card = screen.getByTestId('court-card-4');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByText('LIVE')).toBeInTheDocument();
  });

  test('0対0のコートで「試合を終了する」を押すと「まだ点が入っていません」と出て、確認画面は出ない', () => {
    renderPage();
    // コート3 は 0対0 のまま始まる
    const card = screen.getByTestId('court-card-3');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));

    expect(within(card).getByRole('status')).toHaveTextContent('まだ点が入っていません');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('同点（勝ちゲーム数が同数）のコートで「試合を終了する」を押すと「同点では終了できません」と出る', () => {
    renderPage();
    // コート6 は決勝（上限3ゲーム）。1-1 の同点。
    const card = screen.getByTestId('court-card-6');

    fireEvent.click(within(card).getByRole('button', { name: '試合を終了する' }));

    expect(within(card).getByRole('status')).toHaveTextContent('同点では終了できません');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
