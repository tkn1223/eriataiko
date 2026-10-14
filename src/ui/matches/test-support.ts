import type { BoardMatch } from '@/ui/matches/types';

/**
 * 進行表の部品のテストが使う、試合 1 つの組み立て。値は必要なものだけ上書きする。
 * （本物の値は `src/usecases/build-matches-view.ts` が DB の行から作る。ここはテスト専用）
 */
export function boardMatch(overrides: Partial<BoardMatch> = {}): BoardMatch {
  return {
    matchId: 'm-1',
    status: 'waiting',
    ending: 'normal',
    courtNumber: 1,
    orderInCourt: 1,
    finishedAt: null,
    scorerParticipantId: null,
    scorerLastScoredAt: null,
    reopened: false,
    classLabel: { name: '1部', colorNumber: 1 },
    roundLabel: '予選 1回戦',
    teamA: { teamNumber: 1, players: ['佐藤', '鈴木'], slotLabel: null },
    teamB: { teamNumber: 2, players: ['高橋', '伊藤'], slotLabel: null },
    isMine: false,
    maxGameCount: 1,
    scores: [],
    ...overrides,
  };
}
