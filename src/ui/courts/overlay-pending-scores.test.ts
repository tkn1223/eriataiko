import { describe, expect, test } from 'vitest';
import { overlayPendingScores } from '@/ui/courts/overlay-pending-scores';
import type { CourtMatch, MatchSyncState } from '@/ui/courts/types';

/**
 * サーバーから読んだ試合の一覧に、アプリの中で預かっている「手元の点」（送れていない点と、
 * 送れたが購読でまだ戻ってきていない点）を重ねる。
 * 結果LIVE を開いた（別の画面から戻った）とき、読み直したとき、どちらもこれを通す。
 * 重ねないと、押したはずの点が消えて見える（押した点はサーバーにまだ無いため）。
 * 仕様 2026-10-04 の「送れていない点がある間に結果LIVE に戻ると、押した数字のまま」。
 */

function match(overrides: Partial<CourtMatch> = {}): CourtMatch {
  return {
    matchId: 'match-live',
    status: 'live',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    reopened: false,
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: { teamNumber: 1, players: ['佐藤'], slotLabel: null },
    teamB: { teamNumber: 2, players: ['鈴木'], slotLabel: null },
    isMine: false,
    maxGameCount: 3,
    scores: [{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }],
    ...overrides,
  };
}

function syncState(overrides: Partial<MatchSyncState>): MatchSyncState {
  return {
    retryingMessage: null,
    rejectedMessage: null,
    finishing: false,
    finishRetrying: false,
    finishRejectedMessage: null,
    started: false,
    pendingScores: [],
    ...overrides,
  };
}

describe('overlayPendingScores', () => {
  test('未送信が無ければ、サーバーから読んだ一覧をそのまま返す', () => {
    const board = [match()];

    expect(overlayPendingScores(board, true, {})).toBe(board);
  });

  test('サーバーの数字と未送信の数字が違うときは、未送信の数字を優先する', () => {
    const result = overlayPendingScores([match()], true, {
      'match-live': syncState({ pendingScores: [{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }] }),
    });

    expect(result[0].scores).toEqual([{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }]);
  });

  test('未送信が無いゲームはサーバーの数字のまま。未送信のゲームだけ置き換わり、ゲーム番号順に並ぶ', () => {
    const result = overlayPendingScores([match()], true, {
      'match-live': syncState({ pendingScores: [{ gameNumber: 2, sideAScore: 1, sideBScore: 0 }] }),
    });

    expect(result[0].scores).toEqual([
      { gameNumber: 1, sideAScore: 8, sideBScore: 6 },
      { gameNumber: 2, sideAScore: 1, sideBScore: 0 },
    ]);
  });

  test('呼出待ち（未実施）の試合に押した点も、送れていなければ戻る', () => {
    const result = overlayPendingScores(
      [match({ matchId: 'match-next', status: 'waiting', scores: [] })],
      true,
      {
        'match-next': syncState({
          pendingScores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
        }),
      }
    );

    expect(result[0].scores).toEqual([{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }]);
  });

  test('観戦者には、未送信があっても数字を混ぜない（観戦者は点を入れない）', () => {
    const board = [match()];
    const result = overlayPendingScores(board, false, {
      'match-live': syncState({ pendingScores: [{ gameNumber: 1, sideAScore: 9, sideBScore: 6 }] }),
    });

    expect(result).toBe(board);
  });

  test('別の試合の未送信は混ざらない', () => {
    const board = [match()];
    const result = overlayPendingScores(board, true, {
      'match-other': syncState({
        pendingScores: [{ gameNumber: 1, sideAScore: 1, sideBScore: 0 }],
      }),
    });

    expect(result[0].scores).toEqual([{ gameNumber: 1, sideAScore: 8, sideBScore: 6 }]);
  });
});
