/**
 * /courts（結果LIVE）のテスト用の見本データ。
 *
 * DB につながったいまは画面の型は `src/ui/courts/types.ts` にある。
 * ここは court-live-card / courts-page のテストが使う固定値だけを持つ。
 * **型はここから出さない。** 使う側は types.ts から直接読む（出口が 2 つあると片方が古くなる）。
 */

import type { Court } from '@/ui/courts/types';

export const sampleCourts: Court[] = [
  {
    courtNumber: 1,
    live: {
      matchId: 'sample-match-1',
      status: 'live',
      classLabel: '1部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['佐々木', '井上'] },
      teamB: { number: 2, players: ['田中', '木村'] },
      isMine: false,
      maxGameCount: 1,
      games: [[15, 12]],
    },
    next: {
      classLabel: '2部',
      teamA: { number: 3, players: ['川口', '浜田'] },
      teamB: { number: 4, players: ['小林', '西村'] },
      isMine: false,
    },
  },
  {
    courtNumber: 2,
    live: {
      matchId: 'sample-match-2',
      status: 'live',
      classLabel: '2部',
      roundLabel: '予選 1回戦',
      teamA: { number: 3, players: ['山田', '中川'] },
      teamB: { number: 4, players: ['清水', '岡本'] },
      isMine: false,
      maxGameCount: 1,
      games: [[20, 19]],
    },
    next: {
      classLabel: '3部',
      teamA: { number: 1, players: ['本田', '荒川'] },
      teamB: { number: 2, players: ['坂本', '石田'] },
      isMine: false,
    },
  },
  {
    courtNumber: 3,
    live: {
      matchId: 'sample-match-3',
      status: 'live',
      classLabel: '3部',
      roundLabel: '予選 2回戦',
      teamA: { number: 1, players: ['鈴木', '高橋'] },
      teamB: { number: 2, players: ['伊藤', '渡辺'] },
      isMine: true,
      maxGameCount: 3,
      games: [
        [14, 11],
        [0, 0],
        [0, 0],
      ],
    },
    next: null,
  },
  {
    courtNumber: 4,
    live: {
      matchId: 'sample-match-4',
      status: 'live',
      classLabel: '1部',
      roundLabel: '予選 2回戦',
      teamA: { number: 3, players: ['松本', '中村'] },
      teamB: { number: 4, players: ['加藤', '斎藤'] },
      isMine: false,
      maxGameCount: 1,
      games: [[8, 5]],
    },
    next: {
      classLabel: '1部',
      teamA: { number: 1, players: ['吉田', '山口'] },
      teamB: { number: 2, players: ['佐藤', '森'] },
      isMine: false,
    },
  },
  {
    courtNumber: 5,
    live: {
      matchId: 'sample-match-5',
      status: 'waiting',
      classLabel: '2部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['井上', '小川'] },
      teamB: { number: 2, players: ['林', '橋本'] },
      isMine: false,
      maxGameCount: 1,
      games: [[0, 0]],
    },
    next: {
      classLabel: '2部',
      teamA: { number: 3, players: ['石川', '前田'] },
      teamB: { number: 4, players: ['藤田', '岡田'] },
      isMine: false,
    },
  },
  {
    courtNumber: 6,
    live: {
      matchId: 'sample-match-6',
      status: 'live',
      classLabel: '3部',
      roundLabel: '予選 1回戦',
      teamA: { number: 1, players: ['長谷川', '村上'] },
      teamB: { number: 2, players: ['近藤', '石井'] },
      isMine: false,
      maxGameCount: 1,
      games: [[5, 3]],
    },
    next: null,
  },
  {
    // 進行中の試合が無く、次の試合が決まっているコート。「呼出待ち」の出し分けを確かめる。
    courtNumber: 7,
    live: null,
    next: {
      classLabel: '1部',
      teamA: { number: 3, players: ['斉藤', '坂本'] },
      teamB: { number: 4, players: ['遠藤', '青木'] },
      isMine: true,
    },
  },
  {
    // 進行中の試合も次の試合も無いコート。「予定なし」の出し分けを確かめる。
    courtNumber: 8,
    live: null,
    next: null,
  },
];
