/**
 * /matches（進行表）の画面の形。
 *
 * 元は `sample-data.ts` に型と見本の固定値が同居していたが、DB につないだいまは
 * 「画面の型」だけをここに置く（結果LIVE の `src/ui/courts/types.ts` と同じ形）。
 *
 * **進行表が持つ試合は、結果LIVE と同じ `CourtMatch`。** 他の人の点や試合の終了は
 * 結果LIVE と同じ購読で受け取り、同じ判断（`apply-live-change.ts`）で一覧に当てる。
 * 形が違うと、同じ試合が 2 つの画面で違って見える原因になる。
 *
 * チームの色・部の色の対応は src/domain/class-labels.ts の 1 か所だけ。ここには持たない。
 */

import type { ClassLabel } from '@/domain/class-labels';
import type { GameScore } from '@/domain/scoring';
import type { CourtMatch } from '@/ui/courts/types';

export type { ClassLabel, GameScore };

/** 進行表が持つ試合 1 つ。結果LIVE の `CourtMatch` と同じ。 */
export type BoardMatch = CourtMatch;

/**
 * コート 1 面ぶんのカード。`courtNumber` が null のものは「コート未定」のカード
 * （試合に入っているコート番号から出す。番号が飛んでいれば飛んだまま）。
 */
export type MatchesCourt = {
  /** 開閉の状態を覚えるための鍵。コート番号があれば '3'、未定なら 'undecided'。 */
  key: string;
  courtNumber: number | null;
  /** 試合順（`orderInCourt`）の小さい順。順番が未定のものは最後。 */
  matches: BoardMatch[];
};
