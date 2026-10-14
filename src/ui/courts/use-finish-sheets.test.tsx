import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { CourtMatch } from '@/ui/courts/types';
import { closeSheetsOfEndedMatches, useFinishSheets } from '@/ui/courts/use-finish-sheets';

/**
 * 終了の確認画面の開き閉じと、選んだ棄権を、試合ごとにページ側で覚える。
 * 枠（コートのカードや直し中の枠）が作り直されても、閉じない・選択が消えない。
 * 開いている試合が終わったら閉じる（docs/specs/2026-10-14-courts-stale-result.md）。
 */

function matchOf(matchId: string, status: CourtMatch['status']): CourtMatch {
  return {
    matchId,
    status,
    ending: 'normal',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: status === 'done' ? '2026-10-14T01:00:00+00:00' : null,
    reopened: false,
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: { teamNumber: 1, players: ['佐々木', '井上'], slotLabel: null },
    teamB: { teamNumber: 2, players: ['田中', '木村'], slotLabel: null },
    isMine: false,
    maxGameCount: 1,
    scores: [],
  };
}

describe('closeSheetsOfEndedMatches', () => {
  test('終わった試合の確認画面は閉じる。進行中・呼出待ちの試合のものは残す', () => {
    const sheets = {
      done: { retiredSide: null },
      live: { retiredSide: 'A' as const },
      waiting: { retiredSide: null },
    };
    const board = [matchOf('done', 'done'), matchOf('live', 'live'), matchOf('waiting', 'waiting')];

    expect(closeSheetsOfEndedMatches(sheets, board)).toEqual({
      live: { retiredSide: 'A' },
      waiting: { retiredSide: null },
    });
  });

  test('一覧に無い試合の確認画面も閉じる', () => {
    expect(closeSheetsOfEndedMatches({ gone: { retiredSide: null } }, [])).toEqual({});
  });

  test('閉じるものが無ければ、受け取ったものと同じ参照を返す（描き直しを増やさない）', () => {
    const sheets = { live: { retiredSide: null } };

    expect(closeSheetsOfEndedMatches(sheets, [matchOf('live', 'live')])).toBe(sheets);
  });
});

describe('useFinishSheets', () => {
  test('開くと棄権は未選択。選んだ棄権は試合ごとに覚える', () => {
    const { result } = renderHook(() => useFinishSheets(null));

    expect(result.current.finishSheetOf('a').open).toBe(false);

    act(() => result.current.finishSheetOf('a').onOpen());
    act(() => result.current.finishSheetOf('a').onRetiredSideChange('B'));

    expect(result.current.finishSheetOf('a')).toMatchObject({ open: true, retiredSide: 'B' });
    expect(result.current.finishSheetOf('b')).toMatchObject({ open: false, retiredSide: null });
  });

  test('開き直すたびに、棄権は選び直し（前の選択を持ち越さない）', () => {
    const { result } = renderHook(() => useFinishSheets(null));
    act(() => result.current.finishSheetOf('a').onOpen());
    act(() => result.current.finishSheetOf('a').onRetiredSideChange('A'));
    act(() => result.current.finishSheetOf('a').onClose());

    act(() => result.current.finishSheetOf('a').onOpen());

    expect(result.current.finishSheetOf('a').retiredSide).toBeNull();
  });

  test('開いている試合が終わった一覧が渡されたら閉じる。その試合が戻ってきても、開いたままには戻らない', () => {
    const { result, rerender } = renderHook(({ board }) => useFinishSheets(board), {
      initialProps: { board: [matchOf('a', 'live')] },
    });
    act(() => result.current.finishSheetOf('a').onOpen());
    expect(result.current.finishSheetOf('a').open).toBe(true);

    rerender({ board: [matchOf('a', 'done')] });
    expect(result.current.finishSheetOf('a').open).toBe(false);

    rerender({ board: [matchOf('a', 'live')] });
    expect(result.current.finishSheetOf('a').open).toBe(false);
  });
});
