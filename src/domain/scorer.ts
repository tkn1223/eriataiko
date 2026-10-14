/**
 * 試合の入力担当（同じ試合を 2 人が同時に入れられないようにする）の決まり。
 * DB も画面も時計も触らない。時刻は呼び出し側から渡す。
 *
 * 仕様: docs/specs/2026-10-14-match-scorer.md
 *
 * - 担当は**試合**に付く（コートではない）
 * - 最後に点を入れてから 5 分たつと、ほかの人の担当は外れた（空いている）扱いになる
 * - 空いている／外れた担当は、誰でも確認なしで取れる。ほかの人が担当中（5 分以内）なら、
 *   「引き継ぐ」と明示したときだけ取れる
 * - **自分が担当の試合は、5 分たっていても自分のまま。** 5 分は「ほかの人が取ってよい」目安で、
 *   取られるまでは自分の担当（次の 1 点で時刻が更新される）。画面が勝手に入力を止めない
 */

/** 担当が外れるまでの時間。ゲーム間の休憩は 1〜2 分なので、それを越えて止まっているなら引き継いでよい。 */
export const SCORER_EXPIRY_MS = 5 * 60 * 1000;

/**
 * ある試合の担当の欄。
 * `holderId` は「誰か」を表す id なら何でもよい。比べる相手（`myId`）と同じ種類を渡す
 * （サーバーは人の id、画面は参加者の id）。
 */
export type ScorerSlot = {
  holderId: string | null;
  /** 担当が最後に点を入れた（または担当になった）時刻。 */
  lastScoredAt: Date | null;
};

/** 自分から見た担当の立場。 */
export type ScorerStanding =
  /** 自分が担当。 */
  | 'mine'
  /** 担当がいない、または 5 分たって外れた。誰でも確認なしで取れる。 */
  | 'vacant'
  /** ほかの人が担当中（5 分以内）。 */
  | 'other';

export function scorerStanding(slot: ScorerSlot, myId: string, now: Date): ScorerStanding {
  if (slot.holderId === myId) return 'mine';
  if (slot.holderId === null || slot.lastScoredAt === null) return 'vacant';
  // 時刻が未来（端末の時計が進んでいる）なら差は負になり、外れない側に倒す
  const elapsed = now.getTime() - slot.lastScoredAt.getTime();
  return elapsed >= SCORER_EXPIRY_MS ? 'vacant' : 'other';
}

/**
 * 担当を取る操作の結果。
 * - renew: もう自分が担当。時刻を更新するだけ
 * - claim: 空いている（または外れた）ので取る
 * - takeover: ほかの人が担当中だが、引き継ぐと明示されたので取る
 * - refuse: ほかの人が担当中で、引き継ぐと言われていないので断る
 */
export type ClaimDecision = 'renew' | 'claim' | 'takeover' | 'refuse';

export function decideClaim(
  slot: ScorerSlot,
  myId: string,
  takeOver: boolean,
  now: Date
): ClaimDecision {
  const standing = scorerStanding(slot, myId, now);
  if (standing === 'mine') return 'renew';
  if (standing === 'vacant') return 'claim';
  return takeOver ? 'takeover' : 'refuse';
}

/** 担当の名前（「愛知南のたろう」。チームが無ければ名前だけ）。「さん」は文に合わせて呼ぶ側が付ける。 */
export function scorerLabel(person: { teamName: string | null; playerName: string }): string {
  return person.teamName ? `${person.teamName}の${person.playerName}` : person.playerName;
}

/**
 * 入口が断った理由の種類（応答の `code`）。画面は同じ 409 でも出し方を変える。
 * - not-scorer: 担当でないので、点・終了・「やめる」を受けなかった
 * - scorer-active: ほかの人が入力中なので、取る操作を受けなかった（引き継ぐと言われていない）
 */
export const SCORER_ERROR_CODE = {
  notScorer: 'not-scorer',
  scorerActive: 'scorer-active',
} as const;
