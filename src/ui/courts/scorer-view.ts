import { lastScoredAtOf, scorerStanding } from '@/domain/scorer';
import type { ScorerOpState } from '@/ui/courts/types';

/**
 * 画面が一つの試合の担当をどう見せるか。
 * - mine: 自分が担当。＋ − と「試合を終了する」が出る
 * - vacant: 担当がいない（または 5 分たって外れた）。「入力する人がいません」と「得点を入力する」
 * - other: ほかの人が担当中。「◯◯さんが入力しています」と「引き継ぐ」
 *
 * 5 分・引き継ぎの決まりは `src/domain/scorer.ts`。ここは、画面が持つ値
 * （参加者の id・ISO 8601 の時刻・名前の表）からそれを呼ぶ薄い層。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 */
export type ScorerView =
  | { kind: 'mine' }
  | { kind: 'vacant' }
  /** `name` は「愛知北のじろう」（「さん」は画面が付ける）。 */
  | { kind: 'other'; name: string };

/** 名前の表に無い担当（画面を読み込んだあとに入った参加者）の名前。読み直せば本当の名前が出る。 */
export const UNKNOWN_SCORER_NAME = 'ほかの人';

export function scorerViewOf(input: {
  scorerParticipantId: string | null;
  /** 担当になった時刻（ISO 8601）。 */
  scorerClaimedAt: string | null;
  /** ゲーム番号 → そのゲームの点が最後に保存された時刻（ISO 8601）。 */
  scoreSavedAtByGame: Record<number, string>;
  /** 自分の参加者 id。観戦者・未入場は null（自分が担当になることはない）。 */
  myParticipantId: string | null;
  /** 参加者の id → 担当として出す名前。 */
  labels: Record<string, string>;
  /** いま（ミリ秒）。呼び出し側が渡す（`clock.ts`）。 */
  now: number;
  /** 担当を取る・やめる操作を送っている途中なら、その結果になったものとして見せる。 */
  scorerOp?: ScorerOpState | null;
}): ScorerView {
  // 電波が悪くて操作が届いていなくても、入力は止めない（仕様 ⑤）。操作の結果として見せる
  if (input.scorerOp?.kind === 'claim') return { kind: 'mine' };
  if (input.scorerOp?.kind === 'release') return { kind: 'vacant' };

  const standing = scorerStanding(
    {
      holderId: input.scorerParticipantId,
      lastScoredAt: lastScoredAtOf({
        claimedAt: parseTime(input.scorerClaimedAt),
        lastScoreSavedAt: latestTime(Object.values(input.scoreSavedAtByGame)),
      }),
    },
    // 参加者の id が無い人は誰とも一致しない値を渡す（担当 null と一致して「自分」にならないように）
    input.myParticipantId ?? '',
    new Date(input.now)
  );

  if (standing === 'mine') return { kind: 'mine' };
  if (standing === 'vacant') return { kind: 'vacant' };
  return {
    kind: 'other',
    name:
      (input.scorerParticipantId && input.labels[input.scorerParticipantId]) || UNKNOWN_SCORER_NAME,
  };
}

/** ISO 8601 の時刻を読む。無い・読めない値は null。 */
function parseTime(iso: string | null): Date | null {
  if (!iso) return null;
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? null : time;
}

function latestTime(isoTimes: string[]): Date | null {
  let latest: Date | null = null;
  for (const iso of isoTimes) {
    const time = parseTime(iso);
    if (time && (latest === null || time.getTime() > latest.getTime())) latest = time;
  }
  return latest;
}
