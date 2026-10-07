/**
 * 決勝トーナメントの見た目を作るための見本データ（**この PR の中で消える**）。
 *
 * 予選リーグ側（星取表・順位表・詳細）は本物のデータにつないだので、見本は決勝だけ残っている。
 * 決勝を本物にするコミットで、このファイルごと消す。型は `src/ui/bracket/types.ts`。
 */

import type { KoBracketData } from '@/ui/bracket/types';

/** 予選リーグ中はどの枠も確定しないので、全部プレースホルダの文言にしておく。 */
export const sampleKoBracket: KoBracketData = {
  leagueFinished: false,
  semifinals: [
    {
      id: 'semifinal-1',
      roundLabel: '準決勝1',
      slotA: { label: '予選 1位', isDecided: false },
      slotB: { label: '予選 4位', isDecided: false },
      status: 'waiting',
    },
    {
      id: 'semifinal-2',
      roundLabel: '準決勝2',
      slotA: { label: '予選 2位', isDecided: false },
      slotB: { label: '予選 3位', isDecided: false },
      status: 'waiting',
    },
  ],
  final: {
    id: 'final',
    roundLabel: '決勝',
    slotA: { label: '準決勝1 勝者', isDecided: false },
    slotB: { label: '準決勝2 勝者', isDecided: false },
    status: 'waiting',
  },
  thirdPlace: {
    id: 'third-place',
    roundLabel: '3位決定戦',
    slotA: { label: '準決勝1 敗者', isDecided: false },
    slotB: { label: '準決勝2 敗者', isDecided: false },
    status: 'waiting',
  },
  champion: { decided: false },
};
